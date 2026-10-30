// assets/js/modules/pedidos.js

let listaPedidosGlobal = [];

// ==========================================
// TOAST DE AVISO (NÃO BLOQUEANTE)
// ==========================================
function mostrarToastAviso(titulo, mensagem) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto p-3.5 rounded-2xl border shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 flex items-start gap-3 bg-amber-950/95 border-amber-500/60 text-amber-100 shadow-amber-950/50';

    toast.innerHTML = `
        <span class="text-xl shrink-0">⚠️</span>
        <div class="space-y-0.5 flex-1">
            <h4 class="text-xs font-bold text-amber-300">${titulo}</h4>
            <p class="text-[11px] leading-tight text-slate-300">${mensagem}</p>
        </div>
        <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white text-xs font-bold ml-1 shrink-0">✕</button>
    `;

    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 6000);
    }, 6000);
}

// ==========================================
// VERIFICAÇÃO DINÂMICA DE SALDO DE FILAMENTO
// ==========================================
// Resolve os carretéis de um texto de insumo ("[ID:3] PETG Azul (Bambu), PLA Preto (CR)").
// Regra única usada tanto no abate de estoque quanto no alerta de falta de insumo.
function resolverCarreteisDoInsumo(insumoTexto, filamentos) {
    if (!insumoTexto || !Array.isArray(filamentos) || filamentos.length === 0) return [];

    const listaInsumos = insumoTexto.split(',').map(s => s.trim()).filter(Boolean);
    const carreteis = [];

    for (const insumoStr of listaInsumos) {
        let carretel = null;

        const matchId = insumoStr.match(/\[ID:(\d+)\]/i);
        if (matchId) {
            carretel = filamentos.find(f => String(f.id) === matchId[1]);
        } else {
            // Filamento = material + cor; a marca entre parênteses ("PLA Preto (CR)") é ignorada
            const insumoLimpissimo = insumoStr.replace(/\(.*?\)/g, '').replace(/[(),]/g, '').toLowerCase();
            const palavrasChave = insumoLimpissimo.split(' ').filter(p => p.length > 1);
            if (palavrasChave.length === 0) continue;
            carretel = filamentos.find(f => {
                const desc = `${f.material || ''} ${f.cor || ''}`.toLowerCase();
                return palavrasChave.every(p => desc.includes(p));
            });
        }

        if (carretel && !carreteis.includes(carretel)) carreteis.push(carretel);
    }

    return carreteis;
}

// Verifica o saldo dos carretéis do pedido.
// jaAbatido = true (cards do Kanban): o peso já saiu do estoque na criação, então há falta
// quando algum carretel ficou zerado ou negativo. jaAbatido = false (antes de salvar): compara
// o saldo atual com a parte do peso que cada carretel vai fornecer.
function verificarEstoqueFilamentoPedido(pedido, jaAbatido = true) {
    if (!pedido) return { disponivel: true, saldo: 0, necessario: 0, carreteis: [] };

    const pesoNecessario = Number(pedido.peso_consumido_g || pedido.quantidade_g || 0);
    if (pesoNecessario <= 0) {
        return { disponivel: true, saldo: 0, necessario: 0, carreteis: [] };
    }

    const filamentos = (typeof listaFilamentosGlobal !== 'undefined' && Array.isArray(listaFilamentosGlobal))
        ? listaFilamentosGlobal
        : [];

    let carreteis = resolverCarreteisDoInsumo(pedido.insumo, filamentos);
    if (carreteis.length === 0 && pedido.filamento_id) {
        carreteis = filamentos.filter(f => String(f.id) === String(pedido.filamento_id));
    }

    if (carreteis.length === 0) {
        return { disponivel: false, saldo: 0, necessario: pesoNecessario, carreteis: [] };
    }

    const pesoPorCarretel = pesoNecessario / carreteis.length;
    const detalhes = carreteis.map(f => {
        const saldo = Number(f.peso_restante_g ?? f.peso_restante ?? 0);
        return {
            nome: `${f.material || ''} ${f.cor || ''}`.trim(),
            saldo: saldo,
            necessario: pesoPorCarretel,
            emFalta: jaAbatido ? saldo <= 0 : saldo < pesoPorCarretel
        };
    });

    return {
        disponivel: detalhes.every(d => !d.emFalta),
        saldo: detalhes.reduce((acc, d) => acc + d.saldo, 0),
        necessario: pesoNecessario,
        carreteis: detalhes
    };
}

// Confirma "desfazer recebimento" ao tirar um pedido de Pagamento Recebido. Resolve true/false.
function confirmarEstornoPagamento(pedido) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirmacao-estorno');
        const btnConfirmar = document.getElementById('btn-confirmar-estorno');
        const btnCancelar = document.getElementById('btn-cancelar-estorno');
        const btnFechar = document.getElementById('btn-fechar-estorno');

        const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const valorRecebido = pedido && pedido.valor_liquido_recebido != null
            ? ` O valor que caiu na conta (<strong class="text-slate-100">${moeda(pedido.valor_liquido_recebido)}</strong>) é apagado.`
            : '';
        // Crédito mês a mês entra no caixa pelas datas das parcelas, não pelo recebimento
        const parcelado = pedido && typeof pedidoRecebeMesAMes === 'function' && pedidoRecebeMesAMes(pedido);
        document.getElementById('estorno-texto').innerHTML = parcelado
            ? `O pedido nº ${pedido.id} volta para <strong class="text-slate-100">Enviado</strong>.${valorRecebido} As parcelas continuam previstas no Fluxo de Caixa, pelas datas delas.`
            : `O pedido nº ${pedido ? pedido.id : ''} volta para <strong class="text-slate-100">Enviado</strong> e sai das entradas do Resumo Financeiro.${valorRecebido}`;

        modal.classList.remove('hidden');

        const finalizar = (resultado) => {
            modal.classList.add('hidden');
            btnConfirmar.onclick = btnCancelar.onclick = btnFechar.onclick = null;
            resolve(resultado);
        };
        btnConfirmar.onclick = () => finalizar(true);
        btnCancelar.onclick = btnFechar.onclick = () => finalizar(false);
    });
}

// Filtra os pedidos do Kanban
function filtrarPedidosKanban() {
    const inputBusca = document.getElementById('input-busca-pedido');
    const btnLimpar = document.getElementById('btn-limpar-busca');
    if (!inputBusca) return;

    const termo = inputBusca.value.trim().toLowerCase();

    if (btnLimpar) {
        if (termo.length > 0) btnLimpar.classList.remove('hidden');
        else btnLimpar.classList.add('hidden');
    }

    if (!termo) {
        renderizarKanban(listaPedidosGlobal);
        return;
    }

    // "24", "nº 24" ou "#24" também acham o pedido pelo número
    const termoNumero = termo.replace(/^(n[ºo°]?\.?\s*|#)/, '').trim();
    const pedidosFiltrados = listaPedidosGlobal.filter(p => {
        const codigo = (p.codigo_pedido || '').toLowerCase();
        const cliente = (p.cliente || '').toLowerCase();
        const produto = (p.produto || '').toLowerCase();

        return String(p.id) === termoNumero || codigo.includes(termo) || cliente.includes(termo) || produto.includes(termo);
    });

    renderizarKanban(pedidosFiltrados);
}

function limparBuscaPedidos() {
    const inputBusca = document.getElementById('input-busca-pedido');
    const btnLimpar = document.getElementById('btn-limpar-busca');

    if (inputBusca) inputBusca.value = '';
    if (btnLimpar) btnLimpar.classList.add('hidden');

    renderizarKanban(listaPedidosGlobal);
}

function calcularTempoTotalImpressao(tempoBaseStr, quantidade) {
    if (!tempoBaseStr) return '--:--';
    
    const qtd = parseInt(quantidade, 10) || 1;
    let horas = 0;
    let minutos = 0;

    const matchHoras = tempoBaseStr.match(/(\d+)\s*h/i);
    const matchMinutos = tempoBaseStr.match(/(\d+)\s*m/i);

    if (matchHoras) horas = parseInt(matchHoras[1], 10);
    if (matchMinutos) minutos = parseInt(matchMinutos[1], 10);

    if (!matchHoras && !matchMinutos) {
        if (tempoBaseStr.includes(':')) {
            const partes = tempoBaseStr.split(':');
            horas = parseInt(partes[0], 10) || 0;
            minutos = parseInt(partes[1], 10) || 0;
        } else {
            horas = parseInt(tempoBaseStr, 10) || 0;
        }
    }

    const totalMinutosGeral = ((horas * 60) + minutos) * qtd;
    if (totalMinutosGeral <= 0) return '--:--';

    const hResult = Math.floor(totalMinutosGeral / 60);
    const mResult = totalMinutosGeral % 60;

    const strH = hResult > 0 ? `${String(hResult).padStart(2, '0')}h` : '';
    const strM = mResult > 0 ? `${String(mResult).padStart(2, '0')}m` : '';

    return `${strH} ${strM}`.trim();
}

async function carregarOpcoesFilamentos(selectId, idSelecionado = null) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const { data: filamentos, error } = await _supabase
            .from('filamentos')
            .select('*')
            .order('material', { ascending: true })
            .order('cor', { ascending: true });

        if (error) throw error;

        select.innerHTML = '<option value="">-- Selecione o Filamento --</option>';

        (filamentos || []).forEach(f => {
            const selected = idSelecionado && idSelecionado == f.id ? 'selected' : '';
            select.innerHTML += `<option value="${f.id}" ${selected}>[ID:${f.id}] ${f.material} ${f.cor} (${Math.round(f.peso_restante_g)}g em estoque)</option>`;
        });
    } catch (err) {
        console.error('Erro ao carregar opções de filamentos:', err);
    }
}

// ==========================================
// BAIXA E ESTORNO DE ESTOQUE DE PRODUTOS (PRONTA-ENTREGA)
// ==========================================

// Aceita o ID do produto ou o nome (pedidos antigos guardam só o nome)
async function resolverIdProduto(identificador) {
    if (!identificador) return null;
    if (!isNaN(identificador) && Number(identificador) > 0) return parseInt(identificador, 10);

    const nome = String(identificador).trim().toLowerCase();
    const local = (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal))
        ? listaProdutosGlobal.find(p => p.nome && p.nome.trim().toLowerCase() === nome)
        : null;
    if (local) return local.id;

    const { data, error } = await _supabase.from('produtos').select('id').ilike('nome', String(identificador).trim()).limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0].id;
}

// Retira até "quantidade" unidades da pronta-entrega (atômico, nunca abaixo de zero).
// Retorna quantas unidades saíram de fato, para o pedido guardar e devolver só isso se for excluído.
async function abaterEstoqueProdutoProntaEntrega(identificador, quantidade) {
    const qtd = parseInt(quantidade, 10) || 0;
    if (!identificador || qtd <= 0) return 0;

    try {
        const produtoId = await resolverIdProduto(identificador);
        if (!produtoId) return 0;

        const { data: retiradas, error } = await _supabase.rpc('retirar_pronta_entrega', {
            p_produto_id: produtoId,
            p_qtd: qtd
        });
        if (error) throw error;

        if (typeof carregarProdutos === 'function') {
            await carregarProdutos();
        }
        return Number(retiradas) || 0;
    } catch (err) {
        console.error('Erro ao abater estoque pronta-entrega:', err);
        return 0;
    }
}

async function estornarEstoqueProdutoProntaEntrega(identificador, quantidade) {
    const qtd = parseInt(quantidade, 10) || 0;
    if (!identificador || qtd <= 0) return;

    try {
        const produtoId = await resolverIdProduto(identificador);
        if (!produtoId) return;

        const { error } = await _supabase.rpc('devolver_pronta_entrega', {
            p_produto_id: produtoId,
            p_qtd: qtd
        });
        if (error) throw error;

        if (typeof carregarProdutos === 'function') {
            await carregarProdutos();
        }
    } catch (err) {
        console.error('Erro ao estornar estoque pronta-entrega:', err);
    }
}

// ==========================================
// BAIXA E ESTORNO DE FILAMENTOS
// ==========================================

// Atômico no banco. Pode ficar negativo: o saldo negativo indica quanto falta repor.
// Retorna a linha atualizada do filamento (com o custo médio vigente) ou null.
async function abaterEstoqueFilamento(filamentoId, pesoConsumido) {
    if (!filamentoId || !pesoConsumido || pesoConsumido <= 0) return null;

    try {
        const { data, error } = await _supabase.rpc('movimentar_estoque_filamento', {
            p_filamento_id: parseInt(filamentoId, 10),
            p_delta_g: -pesoConsumido
        });
        if (error) throw error;

        if (typeof carregarFilamentos === 'function') carregarFilamentos();
        return data || null;
    } catch (err) {
        console.error('Erro ao abater estoque do filamento:', err);
        return null;
    }
}

async function estornarEstoqueFilamento(filamentoId, pesoDevolvido) {
    if (!filamentoId || !pesoDevolvido || pesoDevolvido <= 0) return;

    try {
        // O saldo é a soma das compras, então não há "peso máximo do carretel" para limitar a devolução
        const { error } = await _supabase.rpc('movimentar_estoque_filamento', {
            p_filamento_id: parseInt(filamentoId, 10),
            p_delta_g: pesoDevolvido
        });
        if (error) throw error;

        if (typeof carregarFilamentos === 'function') carregarFilamentos();
    } catch (err) {
        console.error('Erro ao estornar estoque do filamento:', err);
    }
}

// Abate os filamentos do produto e devolve o detalhe de custo para gravar no pedido:
// [{ filamento_id, nome, peso_g, custo_g, custo_total }] pelo custo médio vigente no momento.
async function abaterFilamentosDoProduto(produtoNome, pesoTotal) {
    if (!produtoNome || !pesoTotal || pesoTotal <= 0) return [];

    const prod = (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal))
        ? listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === produtoNome.toLowerCase())
        : null;

    if (!prod || !prod.insumo_padrao) return [];

    try {
        const { data: todosFilamentos, error } = await _supabase.from('filamentos').select('*');
        if (error || !todosFilamentos) return [];

        const carreteis = resolverCarreteisDoInsumo(prod.insumo_padrao, todosFilamentos);
        if (carreteis.length === 0) return [];

        const pesoPorInsumo = pesoTotal / carreteis.length;
        const detalhe = [];

        for (const carretel of carreteis) {
            const atualizado = await abaterEstoqueFilamento(carretel.id, pesoPorInsumo);
            const custoG = Number((atualizado || carretel).custo_medio_g || 0);
            detalhe.push({
                filamento_id: carretel.id,
                nome: `${carretel.material || ''} ${carretel.cor || ''}`.trim(),
                peso_g: Math.round(pesoPorInsumo * 100) / 100,
                custo_g: custoG,
                custo_total: Math.round(pesoPorInsumo * custoG * 100) / 100
            });
        }

        return detalhe;
    } catch (err) {
        console.error('Erro ao abater estoque de múltiplos filamentos:', err);
        return [];
    }
}

// Devolve ao estoque o filamento de um pedido excluído.
// Pedidos novos devolvem exatamente o que foi abatido (detalhe gravado); antigos refazem a conta pelo produto.
async function estornarFilamentosDoPedido(pedido) {
    const pesoTotal = Number(pedido?.peso_consumido_g || 0);
    if (!pedido || pesoTotal <= 0) return;

    if (Array.isArray(pedido.custo_insumo_detalhe) && pedido.custo_insumo_detalhe.length > 0) {
        for (const item of pedido.custo_insumo_detalhe) {
            await estornarEstoqueFilamento(item.filamento_id, Number(item.peso_g) || 0);
        }
        return;
    }

    const prod = (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal))
        ? listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === (pedido.produto || '').toLowerCase())
        : null;
    const insumo = prod?.insumo_padrao || pedido.insumo;
    if (!insumo) return;

    try {
        const { data: todosFilamentos, error } = await _supabase.from('filamentos').select('*');
        if (error || !todosFilamentos) return;

        const carreteis = resolverCarreteisDoInsumo(insumo, todosFilamentos);
        if (carreteis.length === 0) return;

        const pesoPorInsumo = pesoTotal / carreteis.length;
        for (const carretel of carreteis) {
            await estornarEstoqueFilamento(carretel.id, pesoPorInsumo);
        }
    } catch (err) {
        console.error('Erro ao estornar estoque de múltiplos filamentos:', err);
    }
}

async function carregarPedidos() {
    try {
        if (typeof carregarFilamentos === 'function' && (!listaFilamentosGlobal || listaFilamentosGlobal.length === 0)) {
            await carregarFilamentos();
        }

        const { data, error } = await _supabase
            .from('pedidos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        listaPedidosGlobal = data || [];
        
        const inputBusca = document.getElementById('input-busca-pedido');
        if (inputBusca && inputBusca.value.trim().length > 0) {
            filtrarPedidosKanban();
        } else {
            renderizarKanban(listaPedidosGlobal);
        }
    } catch (err) {
        console.error('Erro ao carregar pedidos:', err.message);
    }
}

// Quantos cards da coluna Pagamento Recebido aparecem ("Ver mais" soma mais 10)
const PASSO_CARDS_RECEBIDOS = 10;
let limiteCardsRecebidos = PASSO_CARDS_RECEBIDOS;

function renderizarKanban(pedidos) {
    const colunas = {
        'Novo Pedido': document.getElementById('coluna-novo'),
        'Em Produção': document.getElementById('coluna-producao'),
        'Acabamento / Embalagem': document.getElementById('coluna-embalagem'),
        'Aguardando Envio': document.getElementById('coluna-envio'),
        'Concluído': document.getElementById('coluna-concluido'),
        'Pagamento Recebido': document.getElementById('coluna-recebido')
    };

    const contadores = {
        'Novo Pedido': document.getElementById('count-novo'),
        'Em Produção': document.getElementById('count-producao'),
        'Acabamento / Embalagem': document.getElementById('count-embalagem'),
        'Aguardando Envio': document.getElementById('count-envio'),
        'Concluído': document.getElementById('count-concluido'),
        'Pagamento Recebido': document.getElementById('count-recebido')
    };

    Object.values(colunas).forEach(col => { 
        if (col) {
            col.innerHTML = '';
            col.className = col.className.replace(/p-\d+/g, 'p-1');
        }
    });

    const qtds = { 'Novo Pedido': 0, 'Em Produção': 0, 'Acabamento / Embalagem': 0, 'Aguardando Envio': 0, 'Concluído': 0, 'Pagamento Recebido': 0 };

    // Pagamento Recebido só cresce: mostra os pagos mais recentes primeiro, de 10 em 10 (a busca mostra todos)
    const buscando = (document.getElementById('input-busca-pedido')?.value || '').trim().length > 0;
    const recebidos = pedidos
        .filter(p => p.status === 'Pagamento Recebido')
        .sort((a, b) => String(b.data_pagamento || '').localeCompare(String(a.data_pagamento || '')));
    const recebidosVisiveis = new Set((buscando ? recebidos : recebidos.slice(0, limiteCardsRecebidos)).map(p => p.id));

    pedidos.forEach(pedido => {
        const statusVal = pedido.status || 'Novo Pedido';
        const coluna = colunas[statusVal];
        if (coluna) {
            qtds[statusVal] = (qtds[statusVal] || 0) + 1;
            if (statusVal !== 'Pagamento Recebido') coluna.appendChild(criarCardPedido(pedido));
        }
    });

    const colunaRecebidos = colunas['Pagamento Recebido'];
    if (colunaRecebidos) {
        recebidos.filter(p => recebidosVisiveis.has(p.id)).forEach(p => colunaRecebidos.appendChild(criarCardPedido(p)));
        const ocultos = recebidos.length - recebidosVisiveis.size;
        if (ocultos > 0) {
            const botao = document.createElement('button');
            botao.className = 'w-full py-1.5 rounded-lg text-[11px] font-semibold text-slate-300 bg-slate-800/70 hover:bg-slate-700 hover:text-white transition';
            botao.textContent = `Ver mais (faltam ${ocultos})`;
            botao.onclick = () => {
                limiteCardsRecebidos += PASSO_CARDS_RECEBIDOS;
                filtrarPedidosKanban();
            };
            colunaRecebidos.appendChild(botao);
        }
    }

    Object.keys(contadores).forEach(status => {
        if (contadores[status]) contadores[status].textContent = qtds[status] || 0;
    });

    const totalNaFila = (qtds['Novo Pedido'] || 0) + 
                        (qtds['Em Produção'] || 0) + 
                        (qtds['Acabamento / Embalagem'] || 0) + 
                        (qtds['Aguardando Envio'] || 0);

    const totalText = document.getElementById('total-pedidos-text');
    if (totalText) totalText.textContent = `${totalNaFila} Pedido(s) na Fila`;
}

// Fluxo das etapas do Kanban: usado pelo card e pelo pop-up de detalhes
const FLUXO_PROXIMO_PEDIDO = {
    'Novo Pedido': { label: 'Imprimir', status: 'Em Produção' },
    'Em Produção': { label: 'Embalar', status: 'Acabamento / Embalagem' },
    'Acabamento / Embalagem': { label: 'Ok p/ Envio', status: 'Aguardando Envio' },
    'Aguardando Envio': { label: 'Enviar', status: 'Concluído' },
    'Concluído': { label: 'Pag. Liberado', status: 'Pagamento Recebido' }
};

const FLUXO_ANTERIOR_PEDIDO = {
    'Em Produção': 'Novo Pedido',
    'Acabamento / Embalagem': 'Em Produção',
    'Aguardando Envio': 'Acabamento / Embalagem',
    'Concluído': 'Aguardando Envio',
    'Pagamento Recebido': 'Concluído'
};

// Etapas em que o prazo de entrega ainda importa (o pedido não saiu)
const ETAPAS_COM_PRAZO = ['Novo Pedido', 'Em Produção', 'Acabamento / Embalagem', 'Aguardando Envio'];
const DIAS_ALERTA_PRAZO = 2;

const CLASSES_BADGE_CANAL = {
    'Shopee': 'bg-shopee text-white',
    'Mercado Livre': 'bg-ml text-black',
    'Site': 'bg-site text-white',
    'WhatsApp': 'bg-wts text-black'
};

// Ícones do card (traço, herdam a cor do texto)
const ICONE_VOLTAR = `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M5 12l6 6M5 12l6-6"/></svg>`;
const ICONE_CAIXA = `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>`;

// Colunas "date" chegam como "AAAA-MM-DD"; new Date() as leria em UTC e mostraria o dia anterior no Brasil
function formatarDataPedidoBR(valor) {
    if (!valor) return null;
    const soData = typeof valor === 'string' && valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (soData && valor.length === 10) return `${soData[3]}/${soData[2]}/${soData[1]}`;
    return new Date(valor).toLocaleDateString('pt-BR');
}

function nomeCanalPedido(pedido) {
    const origem = pedido.origem || 'Direto';
    return origem === 'Site Próprio' ? 'Site' : origem;
}

function produtoDoPedido(pedido) {
    if (typeof listaProdutosGlobal === 'undefined' || !Array.isArray(listaProdutosGlobal)) return null;
    const nome = (pedido.produto || '').toLowerCase();
    return listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === nome) || null;
}

function quantidadeDoPedido(pedido) {
    return parseInt(pedido.quantidade_unidades || pedido.quantidade || 1, 10);
}

function valorTotalDoPedido(pedido) {
    return Number(pedido.valor_total || 0) * quantidadeDoPedido(pedido);
}

// Pedido que já saiu (colunas Enviado e Pagamento Recebido)
function pedidoJaEnviado(pedido) {
    return ['Concluído', 'Pagamento Recebido'].includes(pedido.status);
}

// "AAAA-MM-DD" → Date local à meia-noite (evita o desvio de fuso do new Date("AAAA-MM-DD"))
function dataLocalDoISO(valor) {
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-').map(Number);
    return new Date(ano, mes - 1, dia);
}

// Cor da faixa lateral do card conforme o prazo
const FAIXA_PRAZO = {
    noPrazo: 'bg-emerald-500',
    alerta: 'bg-amber-500',
    atrasado: 'bg-red-500'
};

// Situação do prazo de envio. Antes de enviar: verde (3+ dias), amarelo (até DIAS_ALERTA_PRAZO dias, incluindo hoje)
// ou vermelho (passou). Depois de enviar, o resultado congela: verde se saiu até o prazo, vermelho se saiu depois.
// "texto" é a versão completa (pop-up); "curto" cabe no card; "faixa" é a cor da lateral (null = sem faixa).
function situacaoPrazoPedido(pedido) {
    if (!pedido.prazo_envio) return { texto: 'Sem prazo', curto: 'Sem prazo', classe: 'text-slate-500', nivel: 'nenhum', faixa: null };

    const dataBR = formatarDataPedidoBR(pedido.prazo_envio);
    const diaMes = dataBR.slice(0, 5);
    const prazo = dataLocalDoISO(pedido.prazo_envio);
    const plural = (n) => `${n} dia${n > 1 ? 's' : ''}`;

    if (pedidoJaEnviado(pedido)) {
        if (!pedido.data_envio) {
            return { texto: `${dataBR} · data de envio não registrada`, curto: `Prazo ${diaMes}`, classe: 'text-slate-500', nivel: 'normal', faixa: null };
        }
        const atrasoEnvio = Math.round((dataLocalDoISO(pedido.data_envio) - prazo) / 86400000);
        if (atrasoEnvio > 0) {
            return { texto: `${dataBR} · enviado ${plural(atrasoEnvio)} depois`, curto: `Atrasou ${atrasoEnvio}d`, classe: 'text-red-400 font-bold', nivel: 'atrasado', faixa: FAIXA_PRAZO.atrasado };
        }
        return { texto: `${dataBR} · enviado no prazo`, curto: 'No prazo', classe: 'text-emerald-400 font-semibold', nivel: 'noPrazo', faixa: FAIXA_PRAZO.noPrazo };
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((prazo - hoje) / 86400000);

    if (dias < 0) {
        return { texto: `${dataBR} · Atrasado ${plural(Math.abs(dias))}`, curto: `Atrasado ${Math.abs(dias)}d`, classe: 'text-red-400 font-bold', nivel: 'atrasado', faixa: FAIXA_PRAZO.atrasado };
    }
    if (dias <= DIAS_ALERTA_PRAZO) {
        const quando = dias === 0 ? 'Hoje' : (dias === 1 ? 'Amanhã' : `Em ${dias} dias`);
        return { texto: `${dataBR} · ${quando}`, curto: dias > 1 ? `Em ${dias}d` : quando, classe: 'text-amber-400 font-bold', nivel: 'alerta', faixa: FAIXA_PRAZO.alerta };
    }
    return { texto: `${dataBR} · em ${plural(dias)}`, curto: diaMes, classe: 'text-slate-400', nivel: 'noPrazo', faixa: FAIXA_PRAZO.noPrazo };
}

function criarCardPedido(pedido) {
    const isColunaPagamento = pedido.status === 'Pagamento Recebido';
    const isColunaNovo = pedido.status === 'Novo Pedido';

    const statusInsumo = verificarEstoqueFilamentoPedido(pedido);
    const temFaltaInsumo = isColunaNovo && !statusInsumo.disponivel;
    const prazo = situacaoPrazoPedido(pedido);

    // A urgência fica só na faixa lateral; a borda destaca apenas falta de filamento e pedido pago
    const card = document.createElement('div');
    card.className = `relative overflow-hidden bg-slate-900 border ${
        temFaltaInsumo ? 'border-red-600/70' : (isColunaPagamento ? 'border-emerald-800/70' : 'border-slate-800')
    } hover:border-slate-600 rounded-xl p-2.5 ${prazo.faixa ? 'pl-3.5' : ''} shadow-lg space-y-2 transition cursor-pointer w-full`;
    card.title = 'Clique para ver os detalhes do pedido e do produto';
    card.onclick = () => abrirDetalhesPedido(pedido.id);

    const produto = produtoDoPedido(pedido);
    const qtd = quantidadeDoPedido(pedido);
    const valorFormatado = valorTotalDoPedido(pedido).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const canal = nomeCanalPedido(pedido);
    const corCanal = (CLASSES_BADGE_CANAL[canal] || 'bg-slate-500').split(' ')[0];
    const proximo = FLUXO_PROXIMO_PEDIDO[pedido.status];
    const anterior = FLUXO_ANTERIOR_PEDIDO[pedido.status];

    const foto = produto && produto.imagem_url
        ? `<img src="${escaparHtml(produto.imagem_url)}" alt="" class="w-10 h-10 rounded-lg object-cover border border-slate-800 shrink-0">`
        : `<div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">${ICONE_CAIXA}</div>`;

    let botaoAvancar = '';
    if (proximo && temFaltaInsumo) {
        botaoAvancar = `
            <button onclick="event.stopPropagation(); trocarAba('estoque'); if (typeof carregarFilamentos === 'function') carregarFilamentos();" title="A produção fica bloqueada até repor o filamento. Clique para abrir o Estoque de Filamentos." class="bg-red-950/60 hover:bg-red-900/60 border border-red-700/50 text-red-200 font-semibold py-1 px-2.5 rounded-lg text-[11px] whitespace-nowrap transition shrink-0">
                Repor filamento
            </button>`;
    } else if (proximo) {
        botaoAvancar = `
            <button onclick="event.stopPropagation(); atualizarStatusPedido(${pedido.id}, '${proximo.status}')" title="Avançar para ${proximo.status}" class="bg-slate-800 hover:bg-indigo-600 text-slate-100 hover:text-white font-semibold py-1 px-2.5 rounded-lg text-[11px] whitespace-nowrap transition shrink-0 active:scale-95">
                ${proximo.label}
            </button>`;
    }

    const botaoVoltar = anterior ? `
        <button onclick="event.stopPropagation(); atualizarStatusPedido(${pedido.id}, '${anterior}')" title="Voltar para ${anterior}" class="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition shrink-0">
            ${ICONE_VOLTAR}
        </button>` : '';

    const pagoEm = isColunaPagamento && pedido.data_pagamento
        ? `<span class="text-[11px] text-emerald-400 whitespace-nowrap">pago ${formatarDataPedidoBR(pedido.data_pagamento).slice(0, 5)}</span>`
        : '';

    card.innerHTML = `
        ${prazo.faixa ? `<span class="absolute left-0 inset-y-0 w-1 ${prazo.faixa}"></span>` : ''}

        <p class="text-center text-[11px] font-bold text-slate-200 pb-1.5 border-b border-slate-800/80">Pedido nº ${pedido.id}</p>

        <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-400">
                <span class="w-2 h-2 rounded-full ${corCanal} shrink-0"></span>
                <span class="truncate">${escaparHtml(canal)}${pedido.codigo_pedido ? ` · ${escaparHtml(pedido.codigo_pedido)}` : ''}</span>
            </span>
            <span class="text-[11px] whitespace-nowrap ${prazo.classe}">${prazo.curto}</span>
        </div>

        <div class="flex gap-2.5">
            ${foto}
            <div class="min-w-0 flex-1">
                <h4 class="text-xs font-semibold text-white leading-snug line-clamp-2 break-words">${escaparHtml(pedido.produto || 'Produto não informado')}</h4>
                <p class="text-[11px] text-slate-400 truncate">${escaparHtml(pedido.cliente || 'Cliente não informado')} · ${qtd} un</p>
                ${temFaltaInsumo ? `<p class="text-[11px] font-semibold text-red-400 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0"></span>Sem filamento</p>` : ''}
            </div>
        </div>

        <div class="flex items-center justify-between gap-2 min-h-[28px]">
            <span class="flex items-baseline gap-1.5 min-w-0">
                <span class="text-[13px] font-bold text-white whitespace-nowrap">${valorFormatado}</span>
                ${pagoEm}
            </span>
            <div class="flex items-center gap-1 shrink-0">
                ${botaoVoltar}
                ${botaoAvancar}
            </div>
        </div>
    `;

    return card;
}

// ==========================================
// POP-UP DE DETALHES (PEDIDO + FINANCEIRO + PRODUTO)
// ==========================================
// As etapas avançam e voltam pelo card; o pop-up mostra tudo e edita o pedido no lugar.
let pedidoDetalhesAbertoId = null;
let pedidoEmEdicao = false;

// Tempo de impressão por unidade ("1:30", "02h 30m", "0:55") → "1h30", "2h" ou "55 min"
function formatarTempoUnidade(tempoStr) {
    const minutos = typeof minutosDeImpressao === 'function' ? Math.round(minutosDeImpressao(tempoStr)) : 0;
    if (!(minutos > 0)) return '-';
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function linhaDetalhe(rotulo, valor, classeValor = 'text-slate-200') {
    return `
        <div class="flex justify-between gap-3 py-1 border-b border-slate-800/70 text-[11px]">
            <span class="text-slate-400 shrink-0">${rotulo}</span>
            <span class="${classeValor} text-right break-words min-w-0">${valor}</span>
        </div>`;
}

async function abrirDetalhesPedido(id) {
    const pedido = listaPedidosGlobal.find(p => p.id === id);
    if (!pedido) return;
    pedidoDetalhesAbertoId = id;
    alternarModoEdicaoPedido(false);

    const produto = produtoDoPedido(pedido);
    const qtd = quantidadeDoPedido(pedido);
    const canal = nomeCanalPedido(pedido);
    const prazo = situacaoPrazoPedido(pedido);
    const statusInsumo = verificarEstoqueFilamentoPedido(pedido);
    const temFaltaInsumo = pedido.status === 'Novo Pedido' && !statusInsumo.disponivel;
    const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Cabeçalho: foto + nome do produto, e embaixo os dados do pedido
    document.getElementById('detalhe-pedido-foto').innerHTML = produto && produto.imagem_url
        ? `<img src="${escaparHtml(produto.imagem_url)}" alt="" class="w-14 h-14 rounded-xl object-cover border border-slate-800">`
        : `<div class="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500">${ICONE_CAIXA}</div>`;
    document.getElementById('detalhe-pedido-titulo').innerHTML = `${escaparHtml(pedido.produto || 'Produto não informado')}${
        produto && produto.sku ? ` <span class="text-xs font-normal text-slate-500">· ${escaparHtml(produto.sku)}</span>` : ''}`;
    // Canal, cliente e quantidade ficam em "Dados do pedido"; o cabeçalho só identifica o pedido
    const corCanal = (CLASSES_BADGE_CANAL[canal] || 'bg-slate-500').split(' ')[0];
    document.getElementById('detalhe-pedido-sub').textContent = `Pedido nº ${pedido.id}`;
    document.getElementById('detalhe-pedido-status').textContent = pedido.status === 'Concluído' ? 'Enviado' : (pedido.status || 'Novo Pedido');

    // Destaques. O lucro real é preenchido por mostrarFinanceiroDoDetalhe (depende da configuração financeira)
    const destaque = (rotulo, valorHtml, extraHtml = '', idValor = '') => `
        <div class="bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 min-w-0">
            <p class="text-[11px] text-slate-500">${rotulo}</p>
            <p ${idValor ? `id="${idValor}"` : ''} class="text-base font-bold text-white whitespace-nowrap truncate">${valorHtml}</p>
            ${extraHtml}
        </div>`;
    const envioValor = pedido.data_envio
        ? formatarDataPedidoBR(pedido.data_envio).slice(0, 5)
        : (pedido.prazo_envio ? formatarDataPedidoBR(pedido.prazo_envio).slice(0, 5) : 'Sem prazo');
    const destaqueEnvio = `
        <div class="relative overflow-hidden bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 ${prazo.faixa ? 'pl-4' : ''} min-w-0">
            ${prazo.faixa ? `<span class="absolute left-0 inset-y-0 w-1 ${prazo.faixa}"></span>` : ''}
            <p class="text-[11px] text-slate-500">${pedido.data_envio ? 'Enviado em' : 'Enviar até'}</p>
            <p class="text-base font-bold text-white whitespace-nowrap">${envioValor}</p>
            <p class="text-[11px] ${prazo.classe} truncate">${prazo.texto.split(' · ')[1] || ''}</p>
        </div>`;
    // Valor personalizado: compara com o preço do catálogo gravado na criação
    const catalogo = Number(pedido.valor_catalogo) || 0;
    const unitario = Number(pedido.valor_total) || 0;
    const desconto = catalogo > 0 && Math.abs(catalogo - unitario) >= 0.01
        ? `<p class="text-[11px] ${unitario < catalogo ? 'text-amber-400' : 'text-emerald-400'} truncate" title="Valor personalizado">catálogo ${moeda(catalogo)} · ${unitario < catalogo ? '−' : '+'}${Math.abs((1 - unitario / catalogo) * 100).toFixed(1)}%</p>`
        : '';
    const extraValor = `${qtd > 1 ? `<p class="text-[11px] text-slate-500">${qtd} × ${moeda(unitario)}</p>` : ''}${desconto}`;

    document.getElementById('detalhe-pedido-destaques').innerHTML = `
        ${destaque('Valor total', moeda(valorTotalDoPedido(pedido)), extraValor)}
        ${destaque('Lucro real', '—', '<p id="destaque-lucro-margem" class="text-[11px] text-slate-500"></p>', 'destaque-lucro')}
        ${destaqueEnvio}
        ${destaque('Impressão', calcularTempoTotalImpressao(pedido.tempo_impressao, qtd), qtd > 1 && produto ? `<p class="text-[11px] text-slate-500">${formatarTempoUnidade(produto.tempo_impressao)} por unidade</p>` : '')}
    `;

    // Produção: filamentos deste pedido + ficha do produto
    const descreverFalta = (saldo) => saldo < 0 ? `faltam ${Math.abs(Math.round(saldo))}g` : 'carretel vazio';
    const linhasFilamento = statusInsumo.carreteis.length > 0
        ? statusInsumo.carreteis.map(c => linhaDetalhe(
            escaparHtml(c.nome),
            temFaltaInsumo && c.emFalta ? descreverFalta(c.saldo) : `${Math.round(c.necessario)}g`,
            temFaltaInsumo && c.emFalta ? 'text-red-400 font-bold' : 'text-slate-200 font-mono'
        )).join('')
        : linhaDetalhe(escaparHtml(pedido.insumo || 'Não informado'),
            temFaltaInsumo ? 'não encontrado no estoque' : `${pedido.peso_consumido_g || pedido.quantidade_g || 0}g`,
            temFaltaInsumo ? 'text-red-400 font-bold' : 'text-slate-200 font-mono');
    const tituloSecao = (texto) => `<p class="text-[11px] font-semibold text-slate-500 pt-3 pb-0.5">${texto}</p>`;

    const linhasProduto = produto ? `
        ${linhaDetalhe('Por unidade', `${formatarTempoUnidade(produto.tempo_impressao)} · ${produto.peso_gramas ? `${produto.peso_gramas}g` : '-'}`, 'text-slate-200 font-mono')}
        ${linhaDetalhe('Bico · multicor (AMS)', `${escaparHtml(produto.bico_recomendado || '0.4mm')} · ${produto.troca_cor_ams ? 'sim' : 'não'}`)}
        ${produto.pos_processamento ? linhaDetalhe('Pós-processamento', escaparHtml(produto.pos_processamento)) : ''}
        ${produto.insumos_adicionais ? linhaDetalhe('Insumos extras', escaparHtml(produto.insumos_adicionais)) : ''}
        ${linhaDetalhe('Pronta entrega', `${produto.estoque_pronta_entrega || 0} un`)}
        ${produto.link_modelo ? `<a href="${escaparHtml(produto.link_modelo)}" target="_blank" rel="noopener" class="inline-block pt-2 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold">Abrir modelo 3D ↗</a>` : ''}`
        : `<p class="text-[11px] text-slate-400 pt-1">"${escaparHtml(pedido.produto || '')}" não foi encontrado no catálogo. Ele pode ter sido renomeado ou excluído.</p>`;

    // Dados do pedido: mesmos campos e mesma ordem do formulário de edição; vazio aparece como "—"
    const vazio = '<span class="text-slate-600">—</span>';
    const jaEnviado = pedidoJaEnviado(pedido);
    const temFrete = CANAIS_COM_FRETE.includes(canal);
    const valorUnitarioTexto = `${moeda(unitario)}${catalogo > 0 && Math.abs(catalogo - unitario) >= 0.01 ? ' <span class="text-[10px] text-amber-400">(personalizado)</span>' : ''}`;
    const freteTexto = Number(pedido.frete_pago) > 0
        ? moeda(pedido.frete_pago)
        : (jaEnviado ? 'não pagou' : '<span class="text-slate-500">informado no envio</span>');
    const recebidoTexto = pedido.valor_liquido_recebido != null
        ? `${moeda(pedido.valor_liquido_recebido)}${pedido.data_pagamento ? ` · ${formatarDataPedidoBR(pedido.data_pagamento).slice(0, 5)}` : ''}`
        : (pedido.data_pagamento ? `pago em ${formatarDataPedidoBR(pedido.data_pagamento)} (estimado)` : '<span class="text-slate-500">não recebido</span>');

    // Crédito mês a mês: o dinheiro não cai de uma vez; mostra cada parcela com a data e se já caiu
    let linhaRecebimento = linhaDetalhe('Caiu na conta', recebidoTexto, 'text-emerald-400');
    if (typeof parcelasDoPedido === 'function' && pedidoRecebeMesAMes(pedido)) {
        const parcelas = parcelasDoPedido(pedido);
        const hoje = hojeISO();
        const todasCairam = parcelas.every(pc => pc.data <= hoje);
        const total = parcelas.reduce((acc, pc) => acc + pc.valor, 0);
        const lista = parcelas.map(pc => `${pc.numero}/${pc.total} · ${moeda(pc.valor)} em ${formatarDataPedidoBR(pc.data).slice(0, 5)} ${
            pc.data <= hoje ? '<span class="text-emerald-400">✓ caiu</span>' : '<span class="text-slate-500">a receber</span>'}`).join('<br>');
        linhaRecebimento = linhaDetalhe(
            todasCairam ? 'Caiu na conta' : 'Cairá na conta',
            `<span class="text-emerald-400 font-semibold">${moeda(total)} em ${parcelas.length}x${pedido.valor_liquido_recebido == null ? ' (estimado)' : ''}</span><br><span class="text-slate-300 font-mono">${lista}</span>`
        );
    }

    document.getElementById('detalhe-pedido-info').innerHTML = `
        ${linhaDetalhe('Canal de venda', `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${corCanal}"></span>${escaparHtml(canal)}</span>`)}
        ${linhaDetalhe('Quantidade', `${qtd} un`)}
        ${linhaDetalhe('Cliente', escaparHtml(pedido.cliente || '') || vazio, 'text-slate-100 font-semibold')}
        ${linhaDetalhe('Código do pedido', pedido.codigo_pedido ? escaparHtml(pedido.codigo_pedido) : vazio, 'text-slate-200 font-mono')}
        ${linhaDetalhe('Data do pedido', formatarDataPedidoBR(pedido.data_pedido || pedido.created_at) || vazio)}
        ${linhaDetalhe('Prazo de envio', prazo.texto, prazo.classe)}
        ${jaEnviado ? linhaDetalhe('Data de envio', pedido.data_envio ? formatarDataPedidoBR(pedido.data_envio) : vazio) : ''}
        ${jaEnviado ? linhaDetalhe('Código de rastreio', pedido.codigo_rastreio ? escaparHtml(pedido.codigo_rastreio) : vazio, 'text-slate-200 font-mono') : ''}
        ${linhaDetalhe('Observações', pedido.observacoes ? `<span class="whitespace-pre-line">${escaparHtml(pedido.observacoes)}</span>` : vazio)}
        ${tituloSecao('Valores do pedido')}
        ${linhaDetalhe('Valor unitário', valorUnitarioTexto)}
        ${CANAIS_PAGAMENTO_PROPRIO.includes(canal) ? linhaDetalhe('Forma de pagamento', descreverPagamento(pedido) || vazio) : ''}
        ${temFrete ? linhaDetalhe('Frete pago', freteTexto) : ''}
        ${linhaRecebimento}
    `;

    document.getElementById('detalhe-pedido-producao').innerHTML = `
        <p class="text-[11px] font-semibold text-slate-500 pt-1 pb-0.5">Filamento deste pedido</p>
        ${linhasFilamento}
        ${tituloSecao('Ficha do produto')}
        ${linhasProduto}
    `;

    document.getElementById('modal-detalhes-pedido').classList.remove('hidden');

    // Financeiro: custos gravados na criação do pedido
    if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
    if (pedidoDetalhesAbertoId === id) mostrarFinanceiroDoDetalhe(pedido);
}

// Coluna Financeiro + destaque "Lucro real" do pop-up (também chamado ao vivo durante a edição)
function mostrarFinanceiroDoDetalhe(pedido) {
    if (typeof renderizarResumoFinanceiroPedido !== 'function' || typeof financeiroDoPedido !== 'function') return;
    renderizarResumoFinanceiroPedido(pedido);

    const f = financeiroDoPedido(pedido);
    const elLucro = document.getElementById('destaque-lucro');
    if (elLucro) {
        elLucro.textContent = f.lucro.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        elLucro.className = `text-base font-bold whitespace-nowrap truncate ${f.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }
    const elMargem = document.getElementById('destaque-lucro-margem');
    if (elMargem) elMargem.textContent = f.bruto > 0 ? `${((f.lucro / f.bruto) * 100).toFixed(0)}% da venda` : '';
}

function fecharDetalhesPedido() {
    document.getElementById('modal-detalhes-pedido').classList.add('hidden');
    alternarModoEdicaoPedido(false);
    pedidoDetalhesAbertoId = null;
}

function alternarModoEdicaoPedido(editando) {
    pedidoEmEdicao = editando;
    document.getElementById('detalhe-pedido-info').classList.toggle('hidden', editando);
    document.getElementById('form-editar-pedido').classList.toggle('hidden', !editando);
    document.getElementById('detalhe-btn-editar').classList.toggle('hidden', editando);
    document.getElementById('detalhe-pedido-rodape').classList.toggle('hidden', editando);
}

function sairModoEdicaoPedido() {
    alternarModoEdicaoPedido(false);
    const pedido = listaPedidosGlobal.find(p => p.id === pedidoDetalhesAbertoId);
    if (pedido) mostrarFinanceiroDoDetalhe(pedido);
}

// Ações do rodapé do pop-up
function acaoDetalhesPedido(acao) {
    const id = pedidoDetalhesAbertoId;
    if (!listaPedidosGlobal.find(p => p.id === id)) return;
    fecharDetalhesPedido();

    if (acao === 'excluir') excluirPedido(id);
}

let atualizarResumoEdicaoPedido = null;

// "Caiu na conta" só fica editável com o checkbox marcado, para não preencher sem querer.
// Desmarcado = ainda não recebido (o financeiro usa a taxa estimada).
function alternarCampoLiquido() {
    const marcado = document.getElementById('check-editar-liquido').checked;
    const campo = document.getElementById('input-editar-liquido');
    campo.disabled = !marcado;
    campo.required = marcado;
    if (marcado) {
        campo.focus();
    } else {
        campo.value = '';
    }
    if (atualizarResumoEdicaoPedido) atualizarResumoEdicaoPedido();
}

// Troca a coluna "Pedido" do pop-up pelo formulário de edição
function entrarModoEdicaoPedido() {
    const pedido = listaPedidosGlobal.find(p => p.id === pedidoDetalhesAbertoId);
    if (!pedido) return;

    const inputId = document.getElementById('input-editar-id');
    if (inputId) inputId.value = pedido.id;

    const selectOrigem = document.getElementById('input-editar-origem');
    if (selectOrigem) selectOrigem.value = normalizarOrigem(pedido.origem);
    preencherPagamentoNoFormulario('input-editar', pedido);

    if (document.getElementById('input-editar-cliente')) document.getElementById('input-editar-cliente').value = pedido.cliente || '';
    const campoCodigo = document.getElementById('input-editar-codigo');
    campoCodigo.value = pedido.codigo_pedido || '';
    delete campoCodigo.dataset.gerado;
    ajustarCodigoPorCanal('input-editar-origem', 'input-editar-codigo', true);
    if (document.getElementById('input-editar-valor')) document.getElementById('input-editar-valor').value = pedido.valor_total || '';

    // Mesma regra do cadastro: valor travado no preço do catálogo, a não ser que seja personalizado
    const catalogo = precoCatalogoDoPedido(pedido);
    const personalizado = !(catalogo > 0) || Math.abs(catalogo - Number(pedido.valor_total || 0)) >= 0.01;
    document.getElementById('check-editar-valor-personalizado').checked = personalizado;
    document.getElementById('input-editar-valor').readOnly = !personalizado;
    document.getElementById('info-editar-valor-catalogo').textContent = catalogo > 0
        ? `Catálogo: ${catalogo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
        : 'Produto sem preço no catálogo';
    if (document.getElementById('input-editar-unidades')) document.getElementById('input-editar-unidades').value = pedido.quantidade_unidades || pedido.quantidade || 1;
    
    const rawData = pedido.data_pedido || (pedido.created_at ? pedido.created_at.split('T')[0] : '');
    if (document.getElementById('input-editar-data-pedido')) document.getElementById('input-editar-data-pedido').value = rawData;
    if (document.getElementById('input-editar-prazo')) document.getElementById('input-editar-prazo').value = pedido.prazo_envio || '';

    // Data de envio só existe depois de "Enviar"
    const jaEnviado = pedidoJaEnviado(pedido);
    document.getElementById('campo-editar-data-envio').classList.toggle('hidden', !jaEnviado);
    document.getElementById('grade-editar-datas').classList.toggle('grid-cols-3', jaEnviado);
    document.getElementById('grade-editar-datas').classList.toggle('grid-cols-2', !jaEnviado);
    document.getElementById('input-editar-data-envio').value = pedido.data_envio || '';
    document.getElementById('campo-editar-rastreio').classList.toggle('hidden', !jaEnviado);
    document.getElementById('input-editar-rastreio').value = pedido.codigo_rastreio || '';

    if (document.getElementById('input-editar-obs')) document.getElementById('input-editar-obs').value = pedido.observacoes || '';
    if (document.getElementById('input-editar-frete')) document.getElementById('input-editar-frete').value = Number(pedido.frete_pago) > 0 ? pedido.frete_pago : '';
    // Frete por fora só em Site e WhatsApp (o campo fica para corrigir o que foi informado no envio)
    document.getElementById('campo-editar-frete').classList.toggle('invisible', !CANAIS_COM_FRETE.includes(nomeCanalPedido(pedido)));
    const recebido = pedido.valor_liquido_recebido != null;
    const parcelasLiquido = parcelasDoLiquidoNaEdicao();
    document.getElementById('check-editar-liquido').checked = recebido;
    document.getElementById('input-editar-liquido').value = recebido
        ? (Math.round((Number(pedido.valor_liquido_recebido) / parcelasLiquido) * 100) / 100)
        : '';
    document.getElementById('input-editar-liquido').disabled = !recebido;
    document.getElementById('input-editar-liquido').required = recebido;

    // Recalcula a coluna Financeiro enquanto o valor recebido ou o frete são digitados
    if (typeof renderizarResumoFinanceiroPedido === 'function') {
        const atualizarResumo = () => {
            const liquido = document.getElementById('input-editar-liquido')?.value;
            mostrarFinanceiroDoDetalhe({
                ...pedido,
                ...lerPagamentoDoFormulario('input-editar'),
                valor_liquido_recebido: liquido !== '' && liquido != null ? parseFloat(liquido) * parcelasDoLiquidoNaEdicao() : null,
                frete_pago: parseFloat(document.getElementById('input-editar-frete')?.value) || 0
            });
        };
        ['input-editar-liquido', 'input-editar-frete'].forEach(idCampo => {
            const campo = document.getElementById(idCampo);
            if (campo) campo.oninput = atualizarResumo;
        });
        atualizarResumoEdicaoPedido = atualizarResumo;
    }

    alternarModoEdicaoPedido(true);
    document.getElementById('input-editar-cliente')?.focus();
}

function normalizarOrigem(origem) {
    return origem === 'Site Próprio' ? 'Site' : (origem || 'Shopee');
}

// Pergunta, ao clicar em "Enviar" num pedido de Site ou WhatsApp, se houve frete pago e o rastreio.
// Resolve com { frete, rastreio } ou null se cancelado.
function perguntarDadosEnvio(pedido) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-envio');
        const inputFrete = document.getElementById('input-envio-frete');
        const inputRastreio = document.getElementById('input-envio-rastreio');
        const erro = document.getElementById('envio-frete-erro');
        const btnNao = document.getElementById('btn-envio-frete-nao');
        const btnSim = document.getElementById('btn-envio-frete-sim');
        const btnConfirmar = document.getElementById('btn-confirmar-envio');
        const btnCancelar = document.getElementById('btn-cancelar-envio');
        const btnFechar = document.getElementById('btn-fechar-envio');

        document.getElementById('envio-resumo').textContent =
            `Pedido nº ${pedido.id} · ${nomeCanalPedido(pedido)} · ${pedido.cliente || 'Cliente'} · ${pedido.produto || ''}`;
        inputRastreio.value = pedido.codigo_rastreio || '';
        erro.classList.add('hidden');

        let pagouFrete = Number(pedido.frete_pago) > 0;
        const ATIVO = 'bg-indigo-600 border-indigo-500 text-white';
        const INATIVO = 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white';
        const escolher = (pagou) => {
            pagouFrete = pagou;
            btnSim.className = `py-1.5 rounded-lg text-xs font-semibold border transition ${pagou ? ATIVO : INATIVO}`;
            btnNao.className = `py-1.5 rounded-lg text-xs font-semibold border transition ${pagou ? INATIVO : ATIVO}`;
            inputFrete.disabled = !pagou;
            erro.classList.add('hidden');
            if (pagou) {
                inputFrete.focus();
            } else {
                inputFrete.value = '';
            }
        };
        inputFrete.value = pagouFrete ? Number(pedido.frete_pago).toFixed(2) : '';
        escolher(pagouFrete);
        modal.classList.remove('hidden');

        const finalizar = (resultado) => {
            modal.classList.add('hidden');
            btnNao.onclick = btnSim.onclick = btnConfirmar.onclick = btnCancelar.onclick = btnFechar.onclick = null;
            resolve(resultado);
        };
        btnNao.onclick = () => escolher(false);
        btnSim.onclick = () => escolher(true);
        inputFrete.oninput = () => erro.classList.add('hidden');
        btnCancelar.onclick = btnFechar.onclick = () => finalizar(null);
        btnConfirmar.onclick = () => {
            const frete = pagouFrete ? parseFloat(inputFrete.value) : 0;
            if (pagouFrete && !(frete > 0)) {
                erro.classList.remove('hidden');
                inputFrete.focus();
                return;
            }
            finalizar({ frete, rastreio: inputRastreio.value.trim() || null });
        };
    });
}

// Pergunta o valor que realmente caiu na conta ao marcar "Pagamento Recebido".
// Resolve com { liquido } (número ou null = usar estimativa) ou null se cancelado.
function perguntarValorRecebido(pedido) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-recebimento');
        const input = document.getElementById('input-valor-liquido');
        if (!modal || !input || typeof financeiroDoPedido !== 'function') {
            resolve({ liquido: null });
            return;
        }

        const fin = financeiroDoPedido({ ...pedido, valor_liquido_recebido: null });
        const estimado = Math.round((fin.bruto - fin.taxa) * 100) / 100;
        const moedaLocal = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Crédito mês a mês: pergunta o valor de cada parcela e grava parcela × nº de parcelas
        const parcelas = typeof pedidoRecebeMesAMes === 'function' && pedidoRecebeMesAMes(pedido) ? Number(pedido.parcelas) : 1;
        const estimadoParcela = Math.round((estimado / parcelas) * 100) / 100;

        document.getElementById('recebimento-resumo').innerHTML = `
            <div class="flex justify-between text-slate-400"><span>${pedido.cliente || 'Pedido'} · ${normalizarOrigem(pedido.origem)}</span><span class="text-slate-200">${moedaLocal(fin.bruto)}</span></div>
            <div class="flex justify-between text-slate-400"><span>Taxa estimada</span><span class="text-red-300">- ${moedaLocal(fin.taxa)}</span></div>
            <div class="flex justify-between font-bold border-t border-slate-800 pt-1"><span class="text-slate-300">Estimativa a receber</span><span class="text-emerald-300">${moedaLocal(estimado)}</span></div>
            ${parcelas > 1 ? `<div class="flex justify-between text-slate-400"><span>Em ${parcelas}x, mês a mês</span><span class="text-emerald-300">${parcelas} × ${moedaLocal(estimadoParcela)}</span></div>` : ''}
        `;
        document.getElementById('label-valor-liquido').textContent = parcelas > 1 ? 'Valor de cada parcela (R$)' : 'Valor que caiu na conta (R$)';
        document.getElementById('ajuda-valor-liquido').textContent = parcelas > 1
            ? `Informe quanto cai na conta em cada parcela. O sistema multiplica por ${parcelas} e cada parcela entra no Fluxo de Caixa no mês dela.`
            : 'Já vem preenchido com a estimativa. Ajuste para o valor exato do repasse da plataforma. Se a plataforma descontou frete do repasse, ele já está incluído aqui.';
        input.value = estimadoParcela.toFixed(2);
        modal.classList.remove('hidden');
        input.focus();
        input.select();

        const btnConfirmar = document.getElementById('btn-confirmar-recebimento');
        const btnSemValor = document.getElementById('btn-recebimento-sem-valor');
        const btnFechar = document.getElementById('btn-fechar-recebimento');

        const finalizar = (resultado) => {
            modal.classList.add('hidden');
            btnConfirmar.removeEventListener('click', onConfirmar);
            btnSemValor.removeEventListener('click', onSemValor);
            btnFechar.removeEventListener('click', onFechar);
            resolve(resultado);
        };
        const onConfirmar = () => {
            const valor = parseFloat(input.value);
            finalizar({ liquido: isNaN(valor) ? null : Math.round(valor * parcelas * 100) / 100 });
        };
        const onSemValor = () => finalizar({ liquido: null });
        const onFechar = () => finalizar(null);

        btnConfirmar.addEventListener('click', onConfirmar);
        btnSemValor.addEventListener('click', onSemValor);
        btnFechar.addEventListener('click', onFechar);
    });
}

async function salvarEdicaoPedido(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('input-editar-id')?.value;
    if (!id) return;

    // Produto e filamento não são editáveis: ficam como estão no banco
    const pedidoAtualizado = {
        origem: document.getElementById('input-editar-origem')?.value,
        cliente: document.getElementById('input-editar-cliente')?.value,
        codigo_pedido: document.getElementById('input-editar-codigo')?.value,
        valor_total: parseFloat(document.getElementById('input-editar-valor')?.value) || 0,
        quantidade_unidades: parseInt(document.getElementById('input-editar-unidades')?.value, 10) || 1,
        data_pedido: document.getElementById('input-editar-data-pedido')?.value || null,
        prazo_envio: document.getElementById('input-editar-prazo')?.value || null,
        observacoes: document.getElementById('input-editar-obs')?.value,
        frete_pago: parseFloat(document.getElementById('input-editar-frete')?.value) || 0,
        ...lerPagamentoDoFormulario('input-editar')
    };

    // No crédito mês a mês o campo é o valor de cada parcela; grava o total
    const liquidoInput = document.getElementById('input-editar-liquido')?.value;
    pedidoAtualizado.valor_liquido_recebido = liquidoInput !== '' && liquidoInput != null
        ? Math.round(parseFloat(liquidoInput) * parcelasDoLiquidoNaEdicao() * 100) / 100
        : null;

    const original = listaPedidosGlobal.find(p => String(p.id) === String(id));
    if (original && pedidoJaEnviado(original)) {
        pedidoAtualizado.data_envio = document.getElementById('input-editar-data-envio')?.value || null;
        pedidoAtualizado.codigo_rastreio = document.getElementById('input-editar-rastreio')?.value.trim() || null;
    }
    // Grava o preço de catálogo do canal escolhido: pedido antigo sem ele, ou canal trocado (cada canal tem o seu)
    if (original && (!(Number(original.valor_catalogo) > 0) || normalizarOrigem(original.origem) !== pedidoAtualizado.origem)) {
        const catalogo = catalogoNoCanalDaEdicao();
        if (catalogo > 0) pedidoAtualizado.valor_catalogo = catalogo;
    }

    // Se mudou canal, valor, quantidade ou forma de pagamento, a taxa, o imposto e o custo de máquina são
    // recalculados pela configuração atual; caso contrário, os valores gravados na criação são mantidos
    const mudouBaseDeCalculo = !original ||
        normalizarOrigem(original.origem) !== pedidoAtualizado.origem ||
        Number(original.valor_total) !== pedidoAtualizado.valor_total ||
        (parseInt(original.quantidade_unidades, 10) || 1) !== pedidoAtualizado.quantidade_unidades ||
        (original.forma_pagamento || null) !== pedidoAtualizado.forma_pagamento ||
        (original.parcelas || null) !== pedidoAtualizado.parcelas ||
        (original.juros_cliente ?? null) !== pedidoAtualizado.juros_cliente;

    if (mudouBaseDeCalculo && typeof calcularValoresFinanceirosPedido === 'function') {
        if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
        Object.assign(pedidoAtualizado, calcularValoresFinanceirosPedido({
            origem: pedidoAtualizado.origem,
            valorUnitario: pedidoAtualizado.valor_total,
            quantidade: pedidoAtualizado.quantidade_unidades,
            tempoImpressao: original?.tempo_impressao,
            formaPagamento: pedidoAtualizado.forma_pagamento,
            parcelas: pedidoAtualizado.parcelas,
            jurosCliente: pedidoAtualizado.juros_cliente
        }));
    }

    try {
        const { error } = await _supabase
            .from('pedidos')
            .update(pedidoAtualizado)
            .eq('id', id);

        if (error) throw error;

        // Volta o pop-up para a visualização, já com os dados salvos
        await carregarPedidos();
        if (pedidoDetalhesAbertoId !== null) await abrirDetalhesPedido(pedidoDetalhesAbertoId);
    } catch (err) {
        alert('Erro ao atualizar pedido: ' + err.message);
    }
}

// Preço do catálogo do produto escolhido, no canal escolhido (0 se nenhum produto)
function precoCatalogoSelecionado() {
    const select = document.getElementById('input-produto-sku');
    if (!select || !select.value) return 0;
    const produto = listaProdutosGlobal.find(p => String(p.id) === String(select.value));
    if (!produto) return 0;
    return typeof precoProdutoNoCanal === 'function'
        ? precoProdutoNoCanal(produto, document.getElementById('input-origem')?.value)
        : Number(produto.preco_base) || 0;
}

// O valor unitário vem do catálogo e fica travado; filamento e estoque saem do produto
function autoPreencherProduto() {
    const personalizado = document.getElementById('check-valor-personalizado')?.checked;
    const inputValor = document.getElementById('input-valor');
    const preco = precoCatalogoSelecionado();

    if (!personalizado && inputValor) inputValor.value = preco > 0 ? preco.toFixed(2) : '';
    const info = document.getElementById('info-valor-catalogo');
    const canal = document.getElementById('input-origem')?.value || '';
    if (info) info.textContent = preco > 0 ? `Preço do catálogo (${canal}): ${preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : '';
}

// "Valor personalizado" libera o campo (promoção, desconto); desmarcado, volta ao preço do catálogo
function alternarValorPersonalizado() {
    const marcado = document.getElementById('check-valor-personalizado').checked;
    const inputValor = document.getElementById('input-valor');
    inputValor.readOnly = !marcado;
    if (marcado) {
        inputValor.focus();
        inputValor.select();
    } else {
        autoPreencherProduto();
    }
}

// Preço de catálogo de um pedido: o gravado na criação ou, nos pedidos antigos, o preço atual do produto no canal
function precoCatalogoDoPedido(pedido) {
    if (Number(pedido.valor_catalogo) > 0) return Number(pedido.valor_catalogo);
    const produto = produtoDoPedido(pedido);
    if (!produto) return 0;
    return typeof precoProdutoNoCanal === 'function' ? precoProdutoNoCanal(produto, pedido.origem) : Number(produto.preco_base) || 0;
}

// Edição: trocar o canal muda o preço de catálogo (cada canal tem o seu); sem valor personalizado, o valor acompanha
// Preço de catálogo para o canal escolhido no formulário de edição (o gravado, se o canal não mudou)
function catalogoNoCanalDaEdicao() {
    const pedido = listaPedidosGlobal.find(p => p.id === pedidoDetalhesAbertoId);
    if (!pedido) return 0;
    const canal = document.getElementById('input-editar-origem').value;
    const produto = produtoDoPedido(pedido);
    if (canal === normalizarOrigem(pedido.origem) || !produto || typeof precoProdutoNoCanal !== 'function') return precoCatalogoDoPedido(pedido);
    return precoProdutoNoCanal(produto, canal);
}

function ajustarValorPorCanalEdicao() {
    const catalogo = catalogoNoCanalDaEdicao();
    if (!(catalogo > 0)) return;
    document.getElementById('info-editar-valor-catalogo').textContent = `Catálogo: ${catalogo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    if (!document.getElementById('check-editar-valor-personalizado').checked) {
        document.getElementById('input-editar-valor').value = catalogo.toFixed(2);
    }
}

// Edição: desmarcar "Valor personalizado" volta o valor ao preço do catálogo
function alternarValorPersonalizadoEdicao() {
    const catalogo = catalogoNoCanalDaEdicao();
    const marcado = document.getElementById('check-editar-valor-personalizado').checked;
    const inputValor = document.getElementById('input-editar-valor');

    if (!marcado && !(catalogo > 0)) {
        // Sem preço no catálogo não há para onde voltar: o valor continua livre
        document.getElementById('check-editar-valor-personalizado').checked = true;
        return;
    }
    inputValor.readOnly = !marcado;
    if (marcado) {
        inputValor.focus();
        inputValor.select();
    } else {
        inputValor.value = catalogo.toFixed(2);
    }
}

// Frete pago por fora só existe em Site e WhatsApp; nos marketplaces ele sai do repasse
const CANAIS_COM_FRETE = ['Site', 'WhatsApp'];

// Forma de pagamento (Site e WhatsApp). prefixo = 'input' (cadastro) ou 'input-editar' (edição).
// Mostra parcelas/recebimento/juros só no crédito e exibe a taxa que será somada à do canal.
function ajustarPagamentoPorCanal(prefixo) {
    const el = (sufixo) => document.getElementById(`${prefixo}-${sufixo}`);
    const canal = el('origem')?.value;
    const usaPagamento = CANAIS_PAGAMENTO_PROPRIO.includes(canal);
    el('bloco-pagamento').classList.toggle('hidden', !usaPagamento);
    if (!usaPagamento) return;

    const selectParcelas = el('parcelas');
    if (selectParcelas.options.length === 0) {
        selectParcelas.innerHTML = Array.from({ length: MAX_PARCELAS }, (_, i) =>
            `<option value="${i + 1}">${i + 1}x${i === 0 ? ' (à vista)' : ''}</option>`).join('');
    }

    const forma = el('forma-pagamento').value;
    const credito = forma === 'Crédito';
    const parcelado = credito && parseInt(selectParcelas.value, 10) > 1;
    el('bloco-parcelas').classList.toggle('hidden', !credito);
    el('bloco-credito').classList.toggle('hidden', !parcelado);

    const pct = taxaFormaPagamento({
        origem: canal, formaPagamento: forma, parcelas: selectParcelas.value, jurosCliente: parcelado && el('juros-cliente').checked
    });
    el('info-taxa-pagamento').textContent = `Taxa da forma de pagamento: ${pct.toLocaleString('pt-BR')}% (somada à taxa do canal)`;
    if (prefixo === 'input-editar') parcelasDoLiquidoNaEdicao();
}

// Na edição, "Caiu na conta" vira "Valor de cada parcela" quando o pagamento escolhido é crédito mês a mês.
// Devolve por quanto multiplicar o valor digitado (1 = valor cheio) e ajusta o rótulo do campo.
function parcelasDoLiquidoNaEdicao() {
    const pag = lerPagamentoDoFormulario('input-editar');
    const n = pag.forma_pagamento === 'Crédito' && pag.parcelas > 1 && pag.recebimento_parcelado === 'mes_a_mes' ? pag.parcelas : 1;
    const rotulo = document.getElementById('rotulo-editar-liquido');
    if (rotulo) rotulo.textContent = n > 1 ? `Cada parcela (${n}x, R$)` : 'Caiu na conta (R$)';
    return n;
}

// Lê a forma de pagamento do formulário; nos marketplaces volta tudo nulo
function lerPagamentoDoFormulario(prefixo) {
    const el = (sufixo) => document.getElementById(`${prefixo}-${sufixo}`);
    if (!CANAIS_PAGAMENTO_PROPRIO.includes(el('origem')?.value)) {
        return { forma_pagamento: null, parcelas: null, recebimento_parcelado: null, juros_cliente: null };
    }
    const forma = el('forma-pagamento').value;
    const parcelas = forma === 'Crédito' ? parseInt(el('parcelas').value, 10) || 1 : 1;
    return {
        forma_pagamento: forma,
        parcelas,
        recebimento_parcelado: parcelas > 1 ? el('recebimento').value : null,
        juros_cliente: parcelas > 1 ? el('juros-cliente').checked : null
    };
}

// Preenche o bloco de pagamento: com os dados do pedido (edição) ou com os padrões da configuração (cadastro)
function preencherPagamentoNoFormulario(prefixo, pedido = null) {
    const el = (sufixo) => document.getElementById(`${prefixo}-${sufixo}`);
    const padrao = (typeof configFinanceira !== 'undefined' && configFinanceira.taxas_pagamento) || {};
    ajustarPagamentoPorCanal(prefixo); // cria as opções de parcelas
    el('forma-pagamento').value = pedido?.forma_pagamento || 'Pix';
    el('parcelas').value = String(pedido?.parcelas || 1);
    el('recebimento').value = pedido?.recebimento_parcelado || padrao.recebimento_padrao || 'na_hora';
    el('juros-cliente').checked = pedido?.juros_cliente != null ? !!pedido.juros_cliente : !!padrao.juros_cliente_padrao;
    ajustarPagamentoPorCanal(prefixo);
}

// Texto curto da forma de pagamento ("Crédito 3x · mês a mês")
function descreverPagamento(pedido) {
    if (!pedido.forma_pagamento) return null;
    if (pedido.forma_pagamento !== 'Crédito' || !(pedido.parcelas > 1)) {
        return pedido.forma_pagamento === 'Crédito' ? 'Crédito à vista' : pedido.forma_pagamento;
    }
    const recebe = pedido.recebimento_parcelado === 'mes_a_mes' ? 'recebe mês a mês' : 'recebe na hora';
    return `Crédito ${pedido.parcelas}x · ${recebe}${pedido.juros_cliente ? ' · juros do cliente' : ''}`;
}

function ajustarFretePorCanal() {
    const canal = document.getElementById('input-origem')?.value;
    document.getElementById('campo-frete-novo-pedido')?.classList.toggle('hidden', !CANAIS_COM_FRETE.includes(canal));
}

// WhatsApp não tem código de marketplace: o sistema gera 4 números (sem repetir) e trava o campo.
// Nos outros canais o código vem da plataforma e é digitado. manterExistente = true preserva um código
// já gravado (ao abrir a edição); na troca de canal pelo usuário, um código novo é gerado.
function gerarCodigoWhatsApp() {
    const usados = new Set(listaPedidosGlobal.map(p => String(p.codigo_pedido || '')));
    let codigo;
    do {
        codigo = String(Math.floor(1000 + Math.random() * 9000));
    } while (usados.has(codigo));
    return codigo;
}

function ajustarCodigoPorCanal(idSelectCanal, idCampoCodigo, manterExistente = false) {
    const canal = document.getElementById(idSelectCanal)?.value;
    const campo = document.getElementById(idCampoCodigo);
    if (!campo) return;

    if (canal === 'WhatsApp') {
        if (!(manterExistente && campo.value.trim())) {
            campo.value = gerarCodigoWhatsApp();
            campo.dataset.gerado = '1';
        }
        campo.readOnly = true;
        campo.title = 'Gerado automaticamente para vendas pelo WhatsApp';
    } else {
        // Sai do WhatsApp: o código gerado não serve para a plataforma
        if (campo.dataset.gerado === '1') campo.value = '';
        delete campo.dataset.gerado;
        campo.readOnly = false;
        campo.title = '';
    }
}

async function abrirModalNovoPedido() {
    const modal = document.getElementById('modal-novo-pedido');
    if (modal) {
        const form = document.getElementById('form-pedido');
        if (form) form.reset();
        ajustarCodigoPorCanal('input-origem', 'input-codigo');
        ajustarFretePorCanal();
        if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
        preencherPagamentoNoFormulario('input');
        document.getElementById('input-valor').readOnly = true;
        document.getElementById('info-valor-catalogo').textContent = '';

        const hoje = new Date().toISOString().split('T')[0];
        const inputData = document.getElementById('input-data-pedido');
        if (inputData) inputData.value = hoje;

        if (typeof carregarProdutos === 'function') {
            await carregarProdutos();
        }

        modal.classList.remove('hidden');
    }
}

function fecharModalNovoPedido() {
    const modal = document.getElementById('modal-novo-pedido');
    if (modal) modal.classList.add('hidden');
}

// Salva o novo pedido e executa a verificação não-bloqueante de insumos
async function salvarNovoPedido(event) {
    event.preventDefault();

    const select = document.getElementById('input-produto-sku');
    const option = select ? select.options[select.selectedIndex] : null;
    const nomeProduto = option ? option.getAttribute('data-nome') : '';
    const insumoProduto = option ? option.getAttribute('data-insumo') : '';
    const tempoImpressao = option ? option.getAttribute('data-tempo') : '';
    const produtoIdSelecionado = select && select.value ? select.value : null;
    
    // Carretel principal = primeiro filamento do produto (o abate usa todos os filamentos do produto)
    const filamentosDoProduto = (typeof listaFilamentosGlobal !== 'undefined' && typeof resolverCarreteisDoInsumo === 'function')
        ? resolverCarreteisDoInsumo(insumoProduto, listaFilamentosGlobal)
        : [];
    const filamentoId = filamentosDoProduto.length > 0 ? filamentosDoProduto[0].id : null;

    const qtdUnidades = parseInt(document.getElementById('input-unidades')?.value, 10) || 1;

    let pesoUnitario = 0;
    let prodEncontrado = null;

    if (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal)) {
        prodEncontrado = listaProdutosGlobal.find(p => 
            String(p.id) === String(produtoIdSelecionado) ||
            (p.sku && p.sku === select?.value) ||
            (p.nome && p.nome.toLowerCase() === (nomeProduto || '').toLowerCase())
        );

        if (prodEncontrado && prodEncontrado.peso_gramas) {
            pesoUnitario = parseFloat(prodEncontrado.peso_gramas) || 0;
        }
    }

    const pesoTotalConsumido = pesoUnitario * qtdUnidades;

    const novoPedido = {
        origem: document.getElementById('input-origem')?.value,
        produto: nomeProduto || (prodEncontrado ? prodEncontrado.nome : select?.value),
        cliente: document.getElementById('input-cliente')?.value,
        codigo_pedido: document.getElementById('input-codigo')?.value,
        valor_total: parseFloat(document.getElementById('input-valor')?.value) || 0,
        valor_catalogo: precoCatalogoSelecionado() || null,
        filamento_id: filamentoId ? parseInt(filamentoId, 10) : null,
        peso_consumido_g: pesoTotalConsumido,
        quantidade_unidades: qtdUnidades,
        data_pedido: document.getElementById('input-data-pedido')?.value || new Date().toISOString().split('T')[0],
        prazo_envio: document.getElementById('input-prazo')?.value || null,
        observacoes: document.getElementById('input-obs')?.value,
        tempo_impressao: tempoImpressao,
        insumo: insumoProduto,
        frete_pago: 0,
        ...lerPagamentoDoFormulario('input'),
        status: 'Novo Pedido',
        status_pagamento: 'Pendente'
    };

    // Congela taxa do canal + forma de pagamento, imposto e custo de máquina pela configuração vigente hoje
    if (typeof calcularValoresFinanceirosPedido === 'function') {
        if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
        Object.assign(novoPedido, calcularValoresFinanceirosPedido({
            origem: novoPedido.origem,
            valorUnitario: novoPedido.valor_total,
            quantidade: qtdUnidades,
            tempoImpressao: tempoImpressao,
            formaPagamento: novoPedido.forma_pagamento,
            parcelas: novoPedido.parcelas,
            jurosCliente: novoPedido.juros_cliente
        }));
    }

    // Verificação de disponibilidade de filamento antes de abater
    const checkEstoque = verificarEstoqueFilamentoPedido(novoPedido, false);

    try {
        const { data: pedidoCriado, error } = await _supabase.from('pedidos').insert([novoPedido]).select().single();
        if (error) throw error;

        // Abate o filamento uma única vez, na criação do pedido (a exclusão faz o estorno).
        // Mesmo com saldo insuficiente o abate ocorre (saldo negativo = quanto falta repor).
        const detalheInsumo = pesoTotalConsumido > 0
            ? await abaterFilamentosDoProduto(novoPedido.produto, pesoTotalConsumido)
            : [];

        // Abate estoque pronta-entrega do produto no catálogo (só as unidades que existirem)
        const idOuNomeProduto = prodEncontrado ? prodEncontrado.id : (produtoIdSelecionado || novoPedido.produto);
        const unidadesProntaEntrega = await abaterEstoqueProdutoProntaEntrega(idOuNomeProduto, qtdUnidades);

        // Congela no pedido o custo do filamento (custo médio do momento) e as unidades tiradas da pronta-entrega
        if (pedidoCriado?.id) {
            const { error: errCusto } = await _supabase
                .from('pedidos')
                .update({
                    custo_insumo: detalheInsumo.length > 0
                        ? Math.round(detalheInsumo.reduce((acc, d) => acc + d.custo_total, 0) * 100) / 100
                        : null,
                    custo_insumo_detalhe: detalheInsumo.length > 0 ? detalheInsumo : null,
                    unidades_pronta_entrega: unidadesProntaEntrega
                })
                .eq('id', pedidoCriado.id);
            if (errCusto) console.error('Erro ao gravar custo do insumo no pedido:', errCusto);
        }

        fecharModalNovoPedido();
        await carregarPedidos();

        // Notificação de aviso se houver falta de insumo (NÃO BLOQUEIA)
        if (!checkEstoque.disponivel && pesoTotalConsumido > 0) {
            const faltando = checkEstoque.carreteis
                .filter(c => c.emFalta)
                .map(c => `${c.nome}: ${c.saldo}g disp. / ${Math.round(c.necessario)}g nec.`)
                .join('; ');
            mostrarToastAviso(
                'Pedido Criado com Alerta!',
                `O pedido #${novoPedido.codigo_pedido || 'Novo'} foi registrado na fila, mas há Falta de Insumo no Estoque (${faltando || 'carretel do produto não encontrado no estoque'}).`
            );
        }
    } catch (err) {
        alert('Erro ao salvar pedido: ' + err.message);
    }
}

async function atualizarStatusPedido(id, novoStatus) {
    try {
        const pedido = listaPedidosGlobal.find(p => p.id === id);

        if (pedido && pedido.status === 'Pagamento Recebido' && novoStatus !== 'Pagamento Recebido') {
            const confirmou = await confirmarEstornoPagamento(pedido);
            if (!confirmou) {
                return;
            }
        }

        const updateData = { status: novoStatus };

        // Data de envio: gravada ao clicar em "Enviar" e apagada se o pedido voltar para antes do envio
        if (novoStatus === 'Concluído' && pedido && pedido.status === 'Aguardando Envio') {
            updateData.data_envio = hojeISO();

            // Site e WhatsApp: pergunta o frete pago e o rastreio
            if (CANAIS_COM_FRETE.includes(nomeCanalPedido(pedido))) {
                const envio = await perguntarDadosEnvio(pedido);
                if (!envio) return;
                updateData.frete_pago = envio.frete;
                updateData.codigo_rastreio = envio.rastreio;
            }
        } else if (ETAPAS_COM_PRAZO.includes(novoStatus)) {
            updateData.data_envio = null;
        }

        if (novoStatus === 'Pagamento Recebido') {
            if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
            const recebimento = pedido ? await perguntarValorRecebido(pedido) : { liquido: null };
            if (!recebimento) return;

            updateData.status_pagamento = 'Pago';
            updateData.data_pagamento = new Date().toISOString();
            updateData.valor_liquido_recebido = recebimento.liquido;
        } else if (pedido && pedido.status === 'Pagamento Recebido') {
            updateData.status_pagamento = 'Pendente';
            updateData.data_pagamento = null;
            updateData.valor_liquido_recebido = null;
        }

        const { error } = await _supabase
            .from('pedidos')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        // O filamento já foi abatido na criação do pedido; mudar de etapa não mexe no estoque
        await carregarPedidos();
    } catch (err) {
        alert('Erro ao atualizar status: ' + err.message);
    }
}

async function excluirPedido(id) {
    if (!confirm('Deseja realmente excluir este pedido?')) return;

    try {
        const pedido = listaPedidosGlobal.find(p => p.id === id);

        const { error } = await _supabase.from('pedidos').delete().eq('id', id);
        if (error) throw error;

        if (pedido && pedido.peso_consumido_g > 0) {
            await estornarFilamentosDoPedido(pedido);
        }

        if (pedido && pedido.produto) {
            // Pedidos novos devolvem só as unidades que realmente saíram da pronta-entrega;
            // os antigos (sem esse registro) mantêm a regra anterior de devolver a quantidade do pedido
            const qtdEstorno = pedido.unidades_pronta_entrega != null
                ? parseInt(pedido.unidades_pronta_entrega, 10) || 0
                : (parseInt(pedido.quantidade_unidades || pedido.quantidade || 1, 10) || 1);
            await estornarEstoqueProdutoProntaEntrega(pedido.produto, qtdEstorno);
        }

        await carregarPedidos();
    } catch (err) {
        alert('Erro ao excluir pedido: ' + err.message);
    }
}

function abrirDetalhesProdutoPorNome(nomeProduto) {
    if (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal)) {
        const produto = listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === nomeProduto.toLowerCase());
        if (produto) {
            const elSku = document.getElementById('detalhe-prod-sku');
            if (elSku) elSku.textContent = produto.sku || 'SEM SKU';

            const elNome = document.getElementById('detalhe-prod-nome');
            if (elNome) elNome.textContent = produto.nome;

            const elCat = document.getElementById('detalhe-prod-categoria');
            if (elCat) elCat.textContent = produto.categoria || 'Geral';

            const elBico = document.getElementById('detalhe-prod-bico');
            if (elBico) elBico.textContent = produto.bico_recomendado || '0.4mm';

            const elTempo = document.getElementById('detalhe-prod-tempo');
            if (elTempo) elTempo.textContent = produto.tempo_impressao || '-';

            const elPeso = document.getElementById('detalhe-prod-peso');
            if (elPeso) elPeso.textContent = produto.peso_gramas ? `${produto.peso_gramas}g` : '-';

            const elCusto = document.getElementById('detalhe-prod-custo');
            if (elCusto) elCusto.textContent = Number(produto.custo_estimado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            const elPreco = document.getElementById('detalhe-prod-preco');
            if (elPreco) elPreco.textContent = Number(produto.preco_base || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            const elEstoque = document.getElementById('detalhe-prod-estoque');
            if (elEstoque) elEstoque.textContent = `${produto.estoque_pronta_entrega || 0} un`;

            const elAms = document.getElementById('detalhe-prod-ams');
            if (elAms) elAms.textContent = produto.troca_cor_ams ? 'Sim (Multicor)' : 'Não';

            const elExtras = document.getElementById('detalhe-prod-extras');
            if (elExtras) elExtras.textContent = produto.insumos_adicionais || '-';

            const elPos = document.getElementById('detalhe-prod-pos');
            if (elPos) elPos.textContent = produto.pos_processamento || '-';

            const imgEl = document.getElementById('detalhe-prod-foto');
            const placeholderEl = document.getElementById('detalhe-prod-foto-placeholder');
            if (produto.imagem_url && imgEl && placeholderEl) {
                imgEl.src = produto.imagem_url;
                imgEl.classList.remove('hidden');
                placeholderEl.classList.add('hidden');
            } else if (imgEl && placeholderEl) {
                imgEl.classList.add('hidden');
                placeholderEl.classList.remove('hidden');
            }

            const containerInsumo = document.getElementById('detalhe-prod-insumo');
            if (containerInsumo) {
                if (produto.insumo_padrao) {
                    const tags = produto.insumo_padrao.split(',').map(s => s.trim()).filter(Boolean);
                    containerInsumo.innerHTML = tags.map(t => `<span class="bg-indigo-950 border border-indigo-700/60 text-indigo-200 px-2 py-0.5 rounded text-[10px] font-semibold">🧵 ${t}</span>`).join('');
                } else {
                    containerInsumo.innerHTML = `<span class="text-slate-500 italic">-</span>`;
                }
            }

            const wrapGcode = document.getElementById('wrapper-detalhe-gcode');
            const elGcode = document.getElementById('detalhe-prod-gcode');
            if (produto.gcode_link && wrapGcode && elGcode) {
                elGcode.href = produto.gcode_link;
                wrapGcode.classList.remove('hidden');
            } else if (wrapGcode) {
                wrapGcode.classList.add('hidden');
            }

            const wrapModelo = document.getElementById('wrapper-detalhe-modelo');
            const elModelo = document.getElementById('detalhe-prod-modelo');
            if (produto.link_modelo && wrapModelo && elModelo) {
                elModelo.href = produto.link_modelo;
                wrapModelo.classList.remove('hidden');
            } else if (wrapModelo) {
                wrapModelo.classList.add('hidden');
            }

            const modalDetalhes = document.getElementById('modal-detalhes-produto');
            if (modalDetalhes) modalDetalhes.classList.remove('hidden');
            return;
        }
    }
    alert(`Produto "${nomeProduto}" não foi encontrado no catálogo.`);
}

function fecharModalDetalhesProduto() {
    const modal = document.getElementById('modal-detalhes-produto');
    if (modal) modal.classList.add('hidden');
}

if (typeof window !== 'undefined') {
    window.filtrarPedidosKanban = filtrarPedidosKanban;
    window.limparBuscaPedidos = limparBuscaPedidos;
    window.carregarPedidos = carregarPedidos;
    window.abrirModalNovoPedido = abrirModalNovoPedido;
    window.fecharModalNovoPedido = fecharModalNovoPedido;
    window.salvarNovoPedido = salvarNovoPedido;
    window.entrarModoEdicaoPedido = entrarModoEdicaoPedido;
    window.sairModoEdicaoPedido = sairModoEdicaoPedido;
    window.salvarEdicaoPedido = salvarEdicaoPedido;
    window.atualizarStatusPedido = atualizarStatusPedido;
    window.excluirPedido = excluirPedido;
    window.abrirDetalhesProdutoPorNome = abrirDetalhesProdutoPorNome;
    window.fecharModalDetalhesProduto = fecharModalDetalhesProduto;
    window.abrirDetalhesPedido = abrirDetalhesPedido;
    window.fecharDetalhesPedido = fecharDetalhesPedido;
    window.acaoDetalhesPedido = acaoDetalhesPedido;
    window.autoPreencherProduto = autoPreencherProduto;
    window.abaterEstoqueProdutoProntaEntrega = abaterEstoqueProdutoProntaEntrega;
    window.estornarEstoqueProdutoProntaEntrega = estornarEstoqueProdutoProntaEntrega;
    window.verificarEstoqueFilamentoPedido = verificarEstoqueFilamentoPedido;
    window.mostrarToastAviso = mostrarToastAviso;
}

document.addEventListener('DOMContentLoaded', () => {
    carregarPedidos();
    if (typeof carregarProdutos === 'function') {
        carregarProdutos();
    }
});