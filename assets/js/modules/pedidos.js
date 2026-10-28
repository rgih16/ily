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
function verificarEstoqueFilamentoPedido(pedido) {
    if (!pedido) return { disponivel: true, saldo: 0, necessario: 0 };

    const pesoNecessario = Number(pedido.peso_consumido_g || pedido.quantidade_g || 0);
    if (pesoNecessario <= 0) {
        return { disponivel: true, saldo: 9999, necessario: 0 };
    }

    const filamentos = (typeof listaFilamentosGlobal !== 'undefined' && Array.isArray(listaFilamentosGlobal))
        ? listaFilamentosGlobal
        : [];

    if (filamentos.length === 0) {
        return { disponivel: false, saldo: 0, necessario: pesoNecessario };
    }

    // 1. Busca por ID do carretel
    if (pedido.filamento_id) {
        const carretel = filamentos.find(f => String(f.id) === String(pedido.filamento_id));
        if (!carretel) return { disponivel: false, saldo: 0, necessario: pesoNecessario };
        const pesoRest = Number(carretel.peso_restante_g ?? carretel.peso_restante ?? 0);
        return {
            disponivel: pesoRest >= pesoNecessario,
            saldo: pesoRest,
            necessario: pesoNecessario
        };
    }

    // 2. Busca por compatibilidade de nome/insumo
    const insumoStr = (pedido.insumo || pedido.produto || '').toLowerCase();
    const carretelMatch = filamentos.find(f => {
        const desc = `${f.marca || ''} ${f.material || ''} ${f.cor || ''}`.toLowerCase();
        return insumoStr && (desc.includes(insumoStr) || insumoStr.includes((f.cor || '').toLowerCase()));
    });

    if (carretelMatch) {
        const pesoRest = Number(carretelMatch.peso_restante_g ?? carretelMatch.peso_restante ?? 0);
        return {
            disponivel: pesoRest >= pesoNecessario,
            saldo: pesoRest,
            necessario: pesoNecessario
        };
    }

    return { disponivel: false, saldo: 0, necessario: pesoNecessario };
}

// Modal de confirmação de estorno
function confirmarEstornoPagamento() {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirmacao-estorno');
        const btnConfirmar = document.getElementById('btn-confirmar-estorno');
        const btnCancelar = document.getElementById('btn-cancelar-estorno');

        if (!modal || !btnConfirmar || !btnCancelar) {
            resolve(confirm("Mover este pedido de volta alterará o status para Pendente. Deseja continuar?"));
            return;
        }

        modal.classList.remove('hidden');

        const limparEEscutar = (resultado) => {
            modal.classList.add('hidden');
            btnConfirmar.removeEventListener('click', onConfirmar);
            btnCancelar.removeEventListener('click', onCancelar);
            resolve(resultado);
        };

        const onConfirmar = () => limparEEscutar(true);
        const onCancelar = () => limparEEscutar(false);

        btnConfirmar.addEventListener('click', onConfirmar);
        btnCancelar.addEventListener('click', onCancelar);
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

    const pedidosFiltrados = listaPedidosGlobal.filter(p => {
        const codigo = (p.codigo_pedido || '').toLowerCase();
        const cliente = (p.cliente || '').toLowerCase();
        const produto = (p.produto || '').toLowerCase();

        return codigo.includes(termo) || cliente.includes(termo) || produto.includes(termo);
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
            .order('marca', { ascending: true });

        if (error) throw error;

        select.innerHTML = '<option value="">-- Selecione o Carretel --</option>';

        (filamentos || []).forEach(f => {
            const selected = idSelecionado && idSelecionado == f.id ? 'selected' : '';
            select.innerHTML += `<option value="${f.id}" ${selected}>[ID:${f.id}] ${f.marca} - ${f.material} ${f.cor} (${f.peso_restante_g}g rest.)</option>`;
        });
    } catch (err) {
        console.error('Erro ao carregar opções de filamentos:', err);
    }
}

// ==========================================
// BAIXA E ESTORNO DE ESTOQUE DE PRODUTOS
// ==========================================
async function abaterEstoqueProdutoProntaEntrega(identificador, quantidade) {
    const qtd = parseInt(quantidade, 10) || 0;
    if (!identificador || qtd <= 0) return;

    try {
        let query = _supabase.from('produtos').select('id, estoque_pronta_entrega');

        if (!isNaN(identificador) && Number(identificador) > 0) {
            query = query.eq('id', parseInt(identificador, 10));
        } else {
            query = query.ilike('nome', String(identificador).trim());
        }

        const { data, error } = await query.limit(1);
        if (error || !data || data.length === 0) return;

        const prod = data[0];
        const estoqueAtual = parseInt(prod.estoque_pronta_entrega, 10) || 0;
        const novoEstoque = Math.max(0, estoqueAtual - qtd);

        const { error: errUpdate } = await _supabase
            .from('produtos')
            .update({ estoque_pronta_entrega: novoEstoque })
            .eq('id', prod.id);

        if (errUpdate) throw errUpdate;

        if (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal)) {
            const itemLocal = listaProdutosGlobal.find(p => p.id === prod.id);
            if (itemLocal) itemLocal.estoque_pronta_entrega = novoEstoque;
        }

        if (typeof carregarProdutos === 'function') {
            await carregarProdutos();
        }
    } catch (err) {
        console.error('Erro ao abater estoque pronta-entrega:', err);
    }
}

async function estornarEstoqueProdutoProntaEntrega(identificador, quantidade) {
    const qtd = parseInt(quantidade, 10) || 0;
    if (!identificador || qtd <= 0) return;

    try {
        let query = _supabase.from('produtos').select('id, estoque_pronta_entrega');

        if (!isNaN(identificador) && Number(identificador) > 0) {
            query = query.eq('id', parseInt(identificador, 10));
        } else {
            query = query.ilike('nome', String(identificador).trim());
        }

        const { data, error } = await query.limit(1);
        if (error || !data || data.length === 0) return;

        const prod = data[0];
        const estoqueAtual = parseInt(prod.estoque_pronta_entrega, 10) || 0;
        const novoEstoque = estoqueAtual + qtd;

        const { error: errUpdate } = await _supabase
            .from('produtos')
            .update({ estoque_pronta_entrega: novoEstoque })
            .eq('id', prod.id);

        if (errUpdate) throw errUpdate;

        if (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal)) {
            const itemLocal = listaProdutosGlobal.find(p => p.id === prod.id);
            if (itemLocal) itemLocal.estoque_pronta_entrega = novoEstoque;
        }

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
async function abaterEstoqueFilamento(filamentoId, pesoConsumido) {
    if (!filamentoId || !pesoConsumido || pesoConsumido <= 0) return;

    try {
        const { data: filamento, error: errBusca } = await _supabase
            .from('filamentos')
            .select('peso_restante_g')
            .eq('id', filamentoId)
            .single();

        if (errBusca || !filamento) return;

        const novoPeso = Math.max(0, filamento.peso_restante_g - pesoConsumido);

        await _supabase
            .from('filamentos')
            .update({ peso_restante_g: novoPeso })
            .eq('id', filamentoId);

        if (typeof carregarFilamentos === 'function') carregarFilamentos();
    } catch (err) {
        console.error('Erro ao abater estoque do filamento:', err);
    }
}

async function estornarEstoqueFilamento(filamentoId, pesoDevolvido) {
    if (!filamentoId || !pesoDevolvido || pesoDevolvido <= 0) return;

    try {
        const { data: filamento, error: errBusca } = await _supabase
            .from('filamentos')
            .select('peso_restante_g, peso_total_g')
            .eq('id', filamentoId)
            .single();

        if (errBusca || !filamento) return;

        const pesoMaximo = filamento.peso_total_g || 1000;
        const novoPeso = Math.min(pesoMaximo, filamento.peso_restante_g + pesoDevolvido);

        await _supabase
            .from('filamentos')
            .update({ peso_restante_g: novoPeso })
            .eq('id', filamentoId);

        if (typeof carregarFilamentos === 'function') carregarFilamentos();
    } catch (err) {
        console.error('Erro ao estornar estoque do filamento:', err);
    }
}

async function processarEstoqueMultiplosFilamentos(produtoNome, pesoTotal, operacao = 'abater') {
    if (!produtoNome || !pesoTotal || pesoTotal <= 0) return;

    const prod = (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal))
        ? listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === produtoNome.toLowerCase())
        : null;

    if (!prod || !prod.insumo_padrao) return;

    const listaInsumos = prod.insumo_padrao.split(',').map(s => s.trim()).filter(Boolean);
    if (listaInsumos.length === 0) return;

    const pesoPorInsumo = (pesoTotal / listaInsumos.length);

    try {
        const { data: todosFilamentos, error } = await _supabase.from('filamentos').select('*');
        if (error || !todosFilamentos) return;

        const idsProcessados = new Set();

        for (const insumoStr of listaInsumos) {
            let filamentoId = null;

            const matchId = insumoStr.match(/\[ID:(\d+)\]/i);
            if (matchId) {
                filamentoId = parseInt(matchId[1], 10);
            } else {
                const insumoLimpissimo = insumoStr.replace(/[(),]/g, '').toLowerCase();
                const palavrasChave = insumoLimpissimo.split(' ').filter(p => p.length > 1);
                const carretelMatch = todosFilamentos.find(f => {
                    const desc = `${f.marca} ${f.material} ${f.cor}`.toLowerCase();
                    return palavrasChave.every(p => desc.includes(p));
                });
                if (carretelMatch) filamentoId = carretelMatch.id;
            }

            if (filamentoId && !idsProcessados.has(filamentoId)) {
                idsProcessados.add(filamentoId);
                if (operacao === 'abater') {
                    await abaterEstoqueFilamento(filamentoId, pesoPorInsumo);
                } else if (operacao === 'estornar') {
                    await estornarEstoqueFilamento(filamentoId, pesoPorInsumo);
                }
            }
        }
    } catch (err) {
        console.error(`Erro ao ${operacao} estoque de múltiplos filamentos:`, err);
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

    pedidos.forEach(pedido => {
        const statusVal = pedido.status || 'Novo Pedido';
        const coluna = colunas[statusVal];
        if (coluna) {
            qtds[statusVal] = (qtds[statusVal] || 0) + 1;
            coluna.appendChild(criarCardPedido(pedido));
        }
    });

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

function criarCardPedido(pedido) {
    const isColunaPagamento = pedido.status === 'Pagamento Recebido';
    const isColunaNovo = pedido.status === 'Novo Pedido';
    
    // Verificação de insumo em estoque
    const statusInsumo = verificarEstoqueFilamentoPedido(pedido);
    const temFaltaInsumo = isColunaNovo && !statusInsumo.disponivel;

    const card = document.createElement('div');
    card.className = `bg-slate-900 border ${
        temFaltaInsumo 
            ? 'border-red-600/80 bg-red-950/10 shadow-red-950/20' 
            : (isColunaPagamento ? 'border-emerald-800/80 bg-emerald-950/10' : 'border-slate-800')
    } hover:border-slate-700 rounded-2xl p-2.5 shadow-lg space-y-2 transition relative group flex flex-col justify-between w-full`;

    const rawDataPedido = pedido.data_pedido || pedido.created_at;
    const dataPedido = rawDataPedido ? new Date(rawDataPedido).toLocaleDateString('pt-BR') : 'Não informada';
    const prazoEntrega = pedido.prazo_envio ? new Date(pedido.prazo_envio).toLocaleDateString('pt-BR') : 'Sem prazo';

    const dataPagamentoFormatada = pedido.data_pagamento 
        ? new Date(pedido.data_pagamento).toLocaleDateString('pt-BR') 
        : new Date().toLocaleDateString('pt-BR');

    const qtdUnidades = parseInt(pedido.quantidade_unidades || pedido.quantidade || 1, 10);
    const valorUnitario = Number(pedido.valor_total || 0);
    const valorCalculadoTotal = valorUnitario * qtdUnidades;
    const valorFormatado = valorCalculadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    let urlFoto = null;
    if (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal)) {
        const prodMatch = listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === (pedido.produto || '').toLowerCase());
        if (prodMatch && prodMatch.imagem_url) urlFoto = prodMatch.imagem_url;
    }

    const canalCores = {
        'Shopee': 'bg-shopee text-white font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow',
        'Mercado Livre': 'bg-ml text-slate-950 font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow',
        'Site': 'bg-site text-white font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow',
        'WhatsApp': 'bg-wts text-slate-950 font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow'
    };
    
    let origemNome = pedido.origem || 'Direto';
    if (origemNome === 'Site Próprio') origemNome = 'Site';

    const badgeCanal = canalCores[origemNome] || 'bg-slate-800 text-slate-200 font-bold px-2 py-0.5 rounded-md text-[10px]';
    const tempoCalculado = calcularTempoTotalImpressao(pedido.tempo_impressao, qtdUnidades);

    const fluxoProximo = {
        'Novo Pedido': { label: 'Imprimir ➔', status: 'Em Produção' },
        'Em Produção': { label: 'Embalar ➔', status: 'Acabamento / Embalagem' },
        'Acabamento / Embalagem': { label: 'Ok p/ Envio ➔', status: 'Aguardando Envio' },
        'Aguardando Envio': { label: 'Enviar ➔', status: 'Concluído' },
        'Concluído': { label: 'Pag. Liberado ➔', status: 'Pagamento Recebido' }
    };

    const fluxoAnterior = {
        'Em Produção': 'Novo Pedido',
        'Acabamento / Embalagem': 'Em Produção',
        'Aguardando Envio': 'Acabamento / Embalagem',
        'Concluído': 'Aguardando Envio',
        'Pagamento Recebido': 'Concluído'
    };

    const proximo = fluxoProximo[pedido.status];
    const anteriorStatus = fluxoAnterior[pedido.status];

    card.innerHTML = `
        <div class="border-b border-slate-800/80 pb-2 space-y-1">
            <div class="flex items-center justify-between gap-1">
                <span class="${badgeCanal}">
                    ${origemNome}
                </span>

                ${temFaltaInsumo ? `
                    <span class="inline-flex items-center gap-1 bg-red-950/80 border border-red-700/60 text-red-300 text-[10px] font-bold px-2 py-0.5 rounded-md animate-pulse" title="Insumo insuficiente em estoque (${statusInsumo.saldo}g disp. / ${statusInsumo.necessario}g nec.)">
                        <span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span> ⚠️ Falta de Insumo
                    </span>
                ` : ''}

                <div class="flex items-center gap-1 ml-auto">
                    <button onclick="abrirModalEditarPedido(${pedido.id})" class="p-1 hover:bg-slate-800 rounded-md transition text-slate-400 hover:text-amber-400" title="Editar Pedido">
                        ✏️
                    </button>
                    <button onclick="excluirPedido(${pedido.id})" class="p-1 hover:bg-slate-800 rounded-md transition text-slate-400 hover:text-red-400" title="Excluir Pedido">
                        🗑️
                    </button>
                </div>
            </div>

            <p class="text-[11px] text-slate-400 truncate pt-0.5">
                Cliente: <span class="text-slate-100 font-bold">${pedido.cliente || 'Não informado'}</span>
            </p>

            ${pedido.codigo_pedido ? `
                <div class="text-[10px] font-mono text-indigo-300 font-bold tracking-wider">
                    código: ${pedido.codigo_pedido}
                </div>
            ` : ''}

            <div class="text-[10px] font-mono space-y-0.5 pt-1">
                <div class="text-slate-400 whitespace-nowrap">
                    📄 Pedido: <span class="text-slate-200 font-semibold">${dataPedido}</span>
                </div>
                <div class="text-amber-400 font-semibold whitespace-nowrap">
                    📅 Entrega: <span>${prazoEntrega}</span>
                </div>

                ${isColunaPagamento ? `
                    <div class="bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 font-bold px-2 py-1 rounded-md text-[10px] flex items-center justify-between whitespace-nowrap shadow-sm mt-1">
                        <span>💰 Pago em:</span>
                        <span>${dataPagamentoFormatada}</span>
                    </div>
                ` : ''}
            </div>
        </div>

        <div class="space-y-1.5 pt-1">
            <div class="flex items-start gap-2">
                ${urlFoto ? `
                    <img src="${urlFoto}" alt="${pedido.produto}" class="w-9 h-9 rounded-lg object-cover border border-slate-800 shrink-0 shadow-inner">
                ` : `
                    <div class="w-9 h-9 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 text-lg shadow-inner">
                        🪴
                    </div>
                `}
                
                <h4 onclick="abrirDetalhesProdutoPorNome('${pedido.produto}')" class="text-xs font-black text-white hover:text-indigo-400 cursor-pointer transition leading-snug break-words flex-1" title="Clique para ver detalhes do catálogo">
                    ${pedido.produto}
                </h4>
            </div>

            <div class="flex items-center justify-between pt-1">
                <span class="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-200 text-[10px] font-bold">
                    📦 ${qtdUnidades} un
                </span>
                <p class="text-xs font-extrabold text-emerald-400">
                    ${valorFormatado}
                </p>
            </div>
        </div>

        <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2 space-y-1.5">
            <div class="flex items-center justify-between text-[11px] text-slate-300 font-medium">
                <span class="truncate">🧵 ${pedido.insumo || 'PLA'}</span>
                ${pedido.peso_consumido_g ? `
                    <span class="text-[10px] font-mono font-bold ${temFaltaInsumo ? 'text-red-400' : 'text-slate-400'}">${pedido.peso_consumido_g}g</span>
                ` : (pedido.quantidade_g ? `<span class="text-[10px] text-slate-400 font-mono font-bold">${pedido.quantidade_g}g</span>` : '')}
            </div>

            <div class="text-[10px] text-amber-300 font-mono font-bold pt-1 border-t border-slate-800/60 flex items-center justify-between">
                <span>⏱️ Tempo Total:</span>
                <span>${tempoCalculado}</span>
            </div>
        </div>

        <div class="space-y-2 pt-1">
            ${pedido.observacoes ? `
                <div class="bg-slate-950/60 border border-slate-800/80 p-1.5 rounded-lg text-[10px] text-slate-300 italic flex items-center gap-1">
                    💭 <span class="truncate">${pedido.observacoes}</span>
                </div>
            ` : ''}

            <div class="flex items-center justify-start gap-1 pt-1 border-t border-slate-800/60">
                ${anteriorStatus ? `
                    <button onclick="atualizarStatusPedido(${pedido.id}, '${anteriorStatus}')" class="p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition" title="Voltar etapa">
                        ⬅
                    </button>
                ` : ''}

                ${proximo ? `
                    ${temFaltaInsumo ? `
                        <button disabled title="Estoque insuficiente de filamento (${statusInsumo.saldo}g disp. / ${statusInsumo.necessario}g nec.). Adicione um carretel no Estoque para liberar." class="bg-slate-800/80 border border-red-500/30 text-slate-500 font-bold py-1 px-2 rounded-xl text-[10px] whitespace-nowrap cursor-not-allowed opacity-60 flex items-center gap-1">
                            🚫 Insumo Insuficiente
                        </button>
                    ` : `
                        <button onclick="atualizarStatusPedido(${pedido.id}, '${proximo.status}')" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-1.5 rounded-xl text-[10px] whitespace-nowrap transition border border-indigo-500/40 shadow-sm flex items-center gap-0.5 active:scale-95">
                            ${proximo.label}
                        </button>
                    `}
                ` : ''}
            </div>
        </div>
    `;

    return card;
}

async function abrirModalEditarPedido(id) {
    const pedido = listaPedidosGlobal.find(p => p.id === id);
    if (!pedido) {
        alert('Pedido não encontrado para edição.');
        return;
    }

    await carregarOpcoesFilamentos('input-editar-filamento-id', pedido.filamento_id);

    const selectFilamento = document.getElementById('input-editar-filamento-id');
    if (selectFilamento) {
        selectFilamento.disabled = true;
        selectFilamento.classList.add('opacity-75', 'cursor-not-allowed', 'bg-slate-950');
    }

    const inputId = document.getElementById('input-editar-id');
    if (inputId) inputId.value = pedido.id;

    const selectOrigem = document.getElementById('input-editar-origem');
    if (selectOrigem) {
        let origemTratada = pedido.origem || 'Shopee';
        if (origemTratada === 'Site Próprio') origemTratada = 'Site';
        selectOrigem.value = origemTratada;
    }

    const inputProduto = document.getElementById('input-editar-produto');
    if (inputProduto) {
        inputProduto.value = pedido.produto || '';
        inputProduto.disabled = true;
        inputProduto.classList.add('opacity-75', 'cursor-not-allowed', 'bg-slate-950');
    }

    if (document.getElementById('input-editar-cliente')) document.getElementById('input-editar-cliente').value = pedido.cliente || '';
    if (document.getElementById('input-editar-codigo')) document.getElementById('input-editar-codigo').value = pedido.codigo_pedido || '';
    if (document.getElementById('input-editar-valor')) document.getElementById('input-editar-valor').value = pedido.valor_total || '';
    if (document.getElementById('input-editar-unidades')) document.getElementById('input-editar-unidades').value = pedido.quantidade_unidades || pedido.quantidade || 1;
    
    const rawData = pedido.data_pedido || (pedido.created_at ? pedido.created_at.split('T')[0] : '');
    if (document.getElementById('input-editar-data-pedido')) document.getElementById('input-editar-data-pedido').value = rawData;
    if (document.getElementById('input-editar-prazo')) document.getElementById('input-editar-prazo').value = pedido.prazo_envio || '';
    
    if (document.getElementById('input-editar-obs')) document.getElementById('input-editar-obs').value = pedido.observacoes || '';

    const modalEditar = document.getElementById('modal-editar-pedido');
    if (modalEditar) {
        modalEditar.classList.remove('hidden');
    }
}

function fecharModalEditarPedido() {
    const modalEditar = document.getElementById('modal-editar-pedido');
    if (modalEditar) modalEditar.classList.add('hidden');
}

async function salvarEdicaoPedido(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('input-editar-id')?.value;
    if (!id) return;

    const filamentoId = document.getElementById('input-editar-filamento-id')?.value;

    const pedidoAtualizado = {
        origem: document.getElementById('input-editar-origem')?.value,
        produto: document.getElementById('input-editar-produto')?.value,
        cliente: document.getElementById('input-editar-cliente')?.value,
        codigo_pedido: document.getElementById('input-editar-codigo')?.value,
        valor_total: parseFloat(document.getElementById('input-editar-valor')?.value) || 0,
        filamento_id: filamentoId ? parseInt(filamentoId, 10) : null,
        quantidade_unidades: parseInt(document.getElementById('input-editar-unidades')?.value, 10) || 1,
        data_pedido: document.getElementById('input-editar-data-pedido')?.value || null,
        prazo_envio: document.getElementById('input-editar-prazo')?.value || null,
        observacoes: document.getElementById('input-editar-obs')?.value
    };

    try {
        const { error } = await _supabase
            .from('pedidos')
            .update(pedidoAtualizado)
            .eq('id', id);

        if (error) throw error;

        fecharModalEditarPedido();
        await carregarPedidos();
    } catch (err) {
        alert('Erro ao atualizar pedido: ' + err.message);
    }
}

async function autoPreencherProduto() {
    const select = document.getElementById('input-produto-sku');
    const selectFilamento = document.getElementById('input-filamento-id');
    if (!select || !selectFilamento) return;

    const option = select.options[select.selectedIndex];

    if (option && option.value) {
        const preco = option.getAttribute('data-preco');
        const insumoProduto = option.getAttribute('data-insumo');

        if (preco && parseFloat(preco) > 0) {
            const inputValor = document.getElementById('input-valor');
            if (inputValor) inputValor.value = preco;
        }

        if (insumoProduto) {
            const primeiroInsumo = insumoProduto.split(',')[0].trim().toLowerCase();
            const matchId = primeiroInsumo.match(/\[ID:(\d+)\]/i);
            const targetId = matchId ? matchId[1] : null;

            for (let i = 0; i < selectFilamento.options.length; i++) {
                const optVal = selectFilamento.options[i].value;
                const textoOpcao = selectFilamento.options[i].text.toLowerCase();

                if ((targetId && optVal == targetId) || textoOpcao.includes(primeiroInsumo)) {
                    selectFilamento.selectedIndex = i;
                    break;
                }
            }
        }

        selectFilamento.disabled = true;
        selectFilamento.classList.add('opacity-75', 'cursor-not-allowed', 'bg-slate-950');
    } else {
        selectFilamento.selectedIndex = 0;
        selectFilamento.disabled = true;
        selectFilamento.classList.add('opacity-75', 'cursor-not-allowed', 'bg-slate-950');
    }
}

async function abrirModalNovoPedido() {
    const modal = document.getElementById('modal-novo-pedido');
    if (modal) {
        const form = document.getElementById('form-pedido');
        if (form) form.reset();

        await carregarOpcoesFilamentos('input-filamento-id');

        const selectFilamento = document.getElementById('input-filamento-id');
        if (selectFilamento) {
            selectFilamento.disabled = true;
            selectFilamento.classList.add('opacity-75', 'cursor-not-allowed', 'bg-slate-950');
        }

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
    
    const selectFilamento = document.getElementById('input-filamento-id');
    const filamentoId = selectFilamento && selectFilamento.value ? selectFilamento.value : null;
    
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
        filamento_id: filamentoId ? parseInt(filamentoId, 10) : null,
        peso_consumido_g: pesoTotalConsumido,
        quantidade_unidades: qtdUnidades,
        data_pedido: document.getElementById('input-data-pedido')?.value || new Date().toISOString().split('T')[0],
        prazo_envio: document.getElementById('input-prazo')?.value || null,
        codigo_rastreio: document.getElementById('input-rastreio')?.value,
        observacoes: document.getElementById('input-obs')?.value,
        tempo_impressao: tempoImpressao,
        insumo: insumoProduto,
        status: 'Novo Pedido',
        status_pagamento: 'Pendente'
    };

    // Verificação de disponibilidade de filamento antes de abater
    const checkEstoque = verificarEstoqueFilamentoPedido(novoPedido);

    try {
        const { error } = await _supabase.from('pedidos').insert([novoPedido]);
        if (error) throw error;

        // Abate o carretel de filamento uma única vez, na criação do pedido (a exclusão faz o estorno).
        // Mesmo com saldo insuficiente o abate ocorre (limitado a 0g), para o estorno não devolver material que nunca saiu.
        if (pesoTotalConsumido > 0) {
            await processarEstoqueMultiplosFilamentos(novoPedido.produto, pesoTotalConsumido, 'abater');
        }

        // Abate estoque pronta-entrega do produto no catálogo
        const idOuNomeProduto = prodEncontrado ? prodEncontrado.id : (produtoIdSelecionado || novoPedido.produto);
        await abaterEstoqueProdutoProntaEntrega(idOuNomeProduto, qtdUnidades);

        fecharModalNovoPedido();
        await carregarPedidos();

        // Notificação de aviso se houver falta de insumo (NÃO BLOQUEIA)
        if (!checkEstoque.disponivel && pesoTotalConsumido > 0) {
            mostrarToastAviso(
                'Pedido Criado com Alerta!',
                `O pedido #${novoPedido.codigo_pedido || 'Novo'} foi registrado na fila, mas há Falta de Insumo no Estoque (${checkEstoque.saldo}g disponíveis para ${pesoTotalConsumido}g necessários).`
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
            const confirmou = await confirmarEstornoPagamento();
            if (!confirmou) {
                return;
            }
        }

        const updateData = { status: novoStatus };

        if (novoStatus === 'Pagamento Recebido') {
            updateData.status_pagamento = 'Pago';
            updateData.data_pagamento = new Date().toISOString();
        } else if (pedido && pedido.status === 'Pagamento Recebido') {
            updateData.status_pagamento = 'Pendente';
            updateData.data_pagamento = null;
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
            await processarEstoqueMultiplosFilamentos(pedido.produto, pedido.peso_consumido_g, 'estornar');
        }

        if (pedido && pedido.produto) {
            const qtdEstorno = parseInt(pedido.quantidade_unidades || pedido.quantidade || 1, 10) || 1;
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
    window.abrirModalEditarPedido = abrirModalEditarPedido;
    window.fecharModalEditarPedido = fecharModalEditarPedido;
    window.salvarEdicaoPedido = salvarEdicaoPedido;
    window.atualizarStatusPedido = atualizarStatusPedido;
    window.excluirPedido = excluirPedido;
    window.abrirDetalhesProdutoPorNome = abrirDetalhesProdutoPorNome;
    window.fecharModalDetalhesProduto = fecharModalDetalhesProduto;
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