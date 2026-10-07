// assets/js/modules/pedidos.js

// Lista global de pedidos em memória
let listaPedidosGlobal = [];

// Função utilitária para calcular o tempo total de impressão multiplicando pela quantidade de unidades
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

// Função para buscar pedidos do Supabase
async function carregarPedidos() {
    try {
        const { data, error } = await _supabase
            .from('pedidos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        listaPedidosGlobal = data || [];
        renderizarKanban(listaPedidosGlobal);
    } catch (err) {
        console.error('Erro ao carregar pedidos:', err.message);
    }
}

// Função para renderizar as colunas do Kanban
function renderizarKanban(pedidos) {
    const colunas = {
        'Novo Pedido': document.getElementById('coluna-novo'),
        'Em Produção': document.getElementById('coluna-producao'),
        'Acabamento / Embalagem': document.getElementById('coluna-embalagem'),
        'Aguardando Envio': document.getElementById('coluna-envio'),
        'Concluído': document.getElementById('coluna-concluido')
    };

    const contadores = {
        'Novo Pedido': document.getElementById('count-novo'),
        'Em Produção': document.getElementById('count-producao'),
        'Acabamento / Embalagem': document.getElementById('count-embalagem'),
        'Aguardando Envio': document.getElementById('count-envio'),
        'Concluído': document.getElementById('count-concluido')
    };

    // Limpa colunas e reduz padding para expandir cards
    Object.values(colunas).forEach(col => { 
        if (col) {
            col.innerHTML = '';
            col.className = col.className.replace(/p-\d+/g, 'p-1');
        }
    });

    const qtds = { 'Novo Pedido': 0, 'Em Produção': 0, 'Acabamento / Embalagem': 0, 'Aguardando Envio': 0, 'Concluído': 0 };

    pedidos.forEach(pedido => {
        const coluna = colunas[pedido.status];
        if (coluna) {
            qtds[pedido.status]++;
            coluna.appendChild(criarCardPedido(pedido));
        }
    });

    // Atualiza contadores das colunas individuais
    Object.keys(contadores).forEach(status => {
        if (contadores[status]) contadores[status].textContent = qtds[status] || 0;
    });

    const totalVisivel = Object.values(qtds).reduce((acc, curr) => acc + curr, 0);

    const totalText = document.getElementById('total-pedidos-text');
    if (totalText) totalText.textContent = `${totalVisivel} Pedido(s) na Fila`;
}

// Função para criar o HTML do Card no Kanban
function criarCardPedido(pedido) {
    const card = document.createElement('div');
    card.className = "bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-2.5 shadow-lg space-y-2 transition relative group flex flex-col justify-between w-full";

    // Ponto 1: Datas - Pedido e Prazo de Envio
    const rawDataPedido = pedido.data_pedido || pedido.created_at;
    const dataPedido = rawDataPedido ? new Date(rawDataPedido).toLocaleDateString('pt-BR') : 'Não informada';
    const prazoEntrega = pedido.prazo_envio ? new Date(pedido.prazo_envio).toLocaleDateString('pt-BR') : 'Sem prazo';

    // Quantidade e Cálculo do Valor Total
    const qtdUnidades = parseInt(pedido.quantidade_unidades || pedido.quantidade || 1, 10);
    const valorUnitario = Number(pedido.valor_total || 0);
    const valorCalculadoTotal = valorUnitario * qtdUnidades;
    const valorFormatado = valorCalculadoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Busca foto do produto no catálogo global se existir
    let urlFoto = null;
    if (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal)) {
        const prodMatch = listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === (pedido.produto || '').toLowerCase());
        if (prodMatch && prodMatch.imagem_url) urlFoto = prodMatch.imagem_url;
    }

    // Mapeamento de Cores dos Canais
    const canalCores = {
        'Shopee': 'bg-shopee text-white font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow',
        'Mercado Livre': 'bg-ml text-slate-950 font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow',
        'Site': 'bg-site text-white font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow',
        'WhatsApp': 'bg-wts text-slate-950 font-extrabold px-2 py-0.5 rounded-md text-[10px] shadow'
    };
    
    let origemNome = pedido.origem || 'Direto';
    if (origemNome === 'Site Próprio') origemNome = 'Site';

    const badgeCanal = canalCores[origemNome] || 'bg-slate-800 text-slate-200 font-bold px-2 py-0.5 rounded-md text-[10px]';

    // Cálculo dinâmico do tempo total
    const tempoCalculado = calcularTempoTotalImpressao(pedido.tempo_impressao, qtdUnidades);

    // Fluxo do Kanban
    const fluxoProximo = {
        'Novo Pedido': { label: 'Imprimir ➔', status: 'Em Produção' },
        'Em Produção': { label: 'Embalar ➔', status: 'Acabamento / Embalagem' },
        'Acabamento / Embalagem': { label: 'Pronto p/ envio ➔', status: 'Aguardando Envio' },
        'Aguardando Envio': { label: 'Enviar ➔', status: 'Concluído' }
    };

    const fluxoAnterior = {
        'Em Produção': 'Novo Pedido',
        'Acabamento / Embalagem': 'Em Produção',
        'Aguardando Envio': 'Acabamento / Embalagem',
        'Concluído': 'Aguardando Envio'
    };

    const proximo = fluxoProximo[pedido.status];
    const anteriorStatus = fluxoAnterior[pedido.status];

    card.innerHTML = `
        <!-- BLOCO 1: Canal/Origem, Ações, Cliente, Código e DATAS -->
        <div class="border-b border-slate-800/80 pb-2 space-y-1">
            <div class="flex items-center justify-between gap-1">
                <span class="${badgeCanal}">
                    ${origemNome}
                </span>
                <div class="flex items-center gap-1 ml-auto">
                    <button onclick="abrirModalEditarPedido(${pedido.id})" class="p-1 hover:bg-slate-800 rounded-md transition text-slate-400 hover:text-amber-400" title="Editar Pedido">
                        ✏️
                    </button>
                    <button onclick="excluirPedido(${pedido.id})" class="p-1 hover:bg-slate-800 rounded-md transition text-slate-400 hover:text-red-400" title="Excluir Pedido">
                        🗑️
                    </button>
                </div>
            </div>

            <!-- Cliente -->
            <p class="text-[11px] text-slate-400 truncate pt-0.5">
                Cliente: <span class="text-slate-100 font-bold">${pedido.cliente || 'Não informado'}</span>
            </p>

            <!-- Código do Pedido -->
            ${pedido.codigo_pedido ? `
                <div class="text-[10px] font-mono text-indigo-300 font-bold tracking-wider">
                    código: ${pedido.codigo_pedido}
                </div>
            ` : ''}

            <!-- PONTO 1: Datas - Pedido e Entrega -->
            <div class="text-[10px] font-mono space-y-0.5 pt-1">
                <div class="text-slate-400">
                    📝 Pedido: <span class="text-slate-200 font-semibold">${dataPedido}</span>
                </div>
                <div class="text-amber-400 font-semibold">
                    📅 Entrega: <span>${prazoEntrega}</span>
                </div>
            </div>
        </div>

        <!-- BLOCO 2: Produto (Imagem real ou ícone), Quantidade e Valor Total -->
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

        <!-- BLOCO 3: Insumo, Peso e Tempo Total -->
        <div class="bg-slate-950/80 border border-slate-800/80 rounded-xl p-2 space-y-1.5">
            <div class="flex items-center justify-between text-[11px] text-slate-300 font-medium">
                <span class="truncate">🧵 ${pedido.insumo || 'PLA'}</span>
                ${pedido.quantidade_g ? `
                    <span class="text-[10px] text-slate-400 font-mono font-bold">${pedido.quantidade_g}g</span>
                ` : ''}
            </div>

            <div class="text-[10px] text-amber-300 font-mono font-bold pt-1 border-t border-slate-800/60 flex items-center justify-between">
                <span>⏱️ Tempo Total:</span>
                <span>${tempoCalculado}</span>
            </div>
        </div>

        <!-- BLOCO 4: Observações e Ações (Voltar e Avançar) -->
        <div class="space-y-2 pt-1">
            ${pedido.observacoes ? `
                <div class="bg-slate-950/60 border border-slate-800/80 p-1.5 rounded-lg text-[10px] text-slate-300 italic flex items-center gap-1">
                    💭 <span class="truncate">${pedido.observacoes}</span>
                </div>
            ` : ''}

            <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
                <div>
                    ${anteriorStatus ? `
                        <button onclick="atualizarStatusPedido(${pedido.id}, '${anteriorStatus}')" class="p-1 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition" title="Voltar etapa">
                            ⬅
                        </button>
                    ` : ''}
                </div>

                ${proximo ? `
                    <button onclick="atualizarStatusPedido(${pedido.id}, '${proximo.status}')" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-2 rounded-xl text-[10px] whitespace-nowrap transition border border-indigo-500/40 shadow-sm flex items-center gap-1 active:scale-95 ml-auto">
                        ${proximo.label}
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    return card;
}

// Preenche os dados do pedido no modal de edição
function abrirModalEditarPedido(id) {
    const pedido = listaPedidosGlobal.find(p => p.id === id);
    if (!pedido) {
        alert('Pedido não encontrado para edição.');
        return;
    }

    const inputId = document.getElementById('input-editar-id');
    if (inputId) inputId.value = pedido.id;

    const selectOrigem = document.getElementById('input-editar-origem');
    if (selectOrigem) {
        let origemTratada = pedido.origem || 'Shopee';
        if (origemTratada === 'Site Próprio') origemTratada = 'Site';
        selectOrigem.value = origemTratada;
    }

    if (document.getElementById('input-editar-produto')) document.getElementById('input-editar-produto').value = pedido.produto || '';
    if (document.getElementById('input-editar-cliente')) document.getElementById('input-editar-cliente').value = pedido.cliente || '';
    if (document.getElementById('input-editar-codigo')) document.getElementById('input-editar-codigo').value = pedido.codigo_pedido || '';
    if (document.getElementById('input-editar-valor')) document.getElementById('input-editar-valor').value = pedido.valor_total || '';
    if (document.getElementById('input-editar-insumo')) document.getElementById('input-editar-insumo').value = pedido.insumo || '';
    if (document.getElementById('input-editar-quantidade')) document.getElementById('input-editar-quantidade').value = pedido.quantidade_g || '';
    if (document.getElementById('input-editar-unidades')) document.getElementById('input-editar-unidades').value = pedido.quantidade_unidades || pedido.quantidade || 1;
    
    // Data do Pedido e Prazo de Envio
    const rawData = pedido.data_pedido || (pedido.created_at ? pedido.created_at.split('T')[0] : '');
    if (document.getElementById('input-editar-data-pedido')) document.getElementById('input-editar-data-pedido').value = rawData;
    if (document.getElementById('input-editar-prazo')) document.getElementById('input-editar-prazo').value = pedido.prazo_envio || '';
    
    if (document.getElementById('input-editar-obs')) document.getElementById('input-editar-obs').value = pedido.observacoes || '';

    const modalEditar = document.getElementById('modal-editar-pedido');
    if (modalEditar) {
        modalEditar.classList.remove('hidden');
    }
}

// Fecha o modal de Edição
function fecharModalEditarPedido() {
    const modalEditar = document.getElementById('modal-editar-pedido');
    if (modalEditar) modalEditar.classList.add('hidden');
}

// Salva as alterações do pedido editado no Supabase
async function salvarEdicaoPedido(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('input-editar-id')?.value;
    if (!id) return;

    const pedidoAtualizado = {
        origem: document.getElementById('input-editar-origem')?.value,
        produto: document.getElementById('input-editar-produto')?.value,
        cliente: document.getElementById('input-editar-cliente')?.value,
        codigo_pedido: document.getElementById('input-editar-codigo')?.value,
        valor_total: parseFloat(document.getElementById('input-editar-valor')?.value) || 0,
        insumo: document.getElementById('input-editar-insumo')?.value,
        quantidade_g: document.getElementById('input-editar-quantidade')?.value,
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

// Auto-preenche o preço e o insumo ao selecionar um produto do catálogo
function autoPreencherProduto() {
    const select = document.getElementById('input-produto-sku');
    if (!select) return;
    const option = select.options[select.selectedIndex];

    if (option && option.value) {
        const preco = option.getAttribute('data-preco');
        const insumo = option.getAttribute('data-insumo');

        if (preco && parseFloat(preco) > 0) {
            const inputValor = document.getElementById('input-valor');
            if (inputValor) inputValor.value = preco;
        }
        if (insumo) {
            const inputInsumo = document.getElementById('input-insumo');
            if (inputInsumo) inputInsumo.value = insumo;
        }
    }
}

// Abre o modal de Novo Pedido
async function abrirModalNovoPedido() {
    const modal = document.getElementById('modal-novo-pedido');
    if (modal) {
        const form = document.getElementById('form-pedido');
        if (form) form.reset();
        
        // Define por padrão a data de hoje para o novo pedido
        const hoje = new Date().toISOString().split('T')[0];
        const inputData = document.getElementById('input-data-pedido');
        if (inputData) inputData.value = hoje;

        if (typeof carregarProdutos === 'function') {
            await carregarProdutos();
        }
        
        modal.classList.remove('hidden');
    }
}

// Fecha o modal de Novo Pedido
function fecharModalNovoPedido() {
    const modal = document.getElementById('modal-novo-pedido');
    if (modal) modal.classList.add('hidden');
}

// Salva um novo pedido no Supabase
async function salvarNovoPedido(event) {
    event.preventDefault();

    const select = document.getElementById('input-produto-sku');
    const option = select ? select.options[select.selectedIndex] : null;
    const nomeProduto = option ? option.getAttribute('data-nome') : '';
    const tempoImpressao = option ? option.getAttribute('data-tempo') : '';

    const novoPedido = {
        origem: document.getElementById('input-origem')?.value,
        produto: nomeProduto || select?.value,
        cliente: document.getElementById('input-cliente')?.value,
        codigo_pedido: document.getElementById('input-codigo')?.value,
        valor_total: parseFloat(document.getElementById('input-valor')?.value) || 0,
        insumo: document.getElementById('input-insumo')?.value,
        quantidade_unidades: parseInt(document.getElementById('input-unidades')?.value, 10) || 1,
        data_pedido: document.getElementById('input-data-pedido')?.value || new Date().toISOString().split('T')[0],
        prazo_envio: document.getElementById('input-prazo')?.value || null,
        codigo_rastreio: document.getElementById('input-rastreio')?.value,
        observacoes: document.getElementById('input-obs')?.value,
        tempo_impressao: tempoImpressao,
        status: 'Novo Pedido'
    };

    try {
        const { error } = await _supabase.from('pedidos').insert([novoPedido]);
        if (error) throw error;

        fecharModalNovoPedido();
        await carregarPedidos();
    } catch (err) {
        alert('Erro ao salvar pedido: ' + err.message);
    }
}

// Atualiza o status do pedido
async function atualizarStatusPedido(id, novoStatus) {
    try {
        const { error } = await _supabase
            .from('pedidos')
            .update({ status: novoStatus })
            .eq('id', id);

        if (error) throw error;
        await carregarPedidos();
    } catch (err) {
        alert('Erro ao atualizar status: ' + err.message);
    }
}

// Excluir pedido
async function excluirPedido(id) {
    if (!confirm('Deseja realmente excluir este pedido?')) return;

    try {
        const { error } = await _supabase.from('pedidos').delete().eq('id', id);
        if (error) throw error;
        await carregarPedidos();
    } catch (err) {
        alert('Erro ao excluir pedido: ' + err.message);
    }
}

// PONTO 2: ABRE DETALHES DO PRODUTO EM MODO APENAS LEITURA (SEM PERMITIR ALTERAÇÃO)
function abrirDetalhesProdutoPorNome(nomeProduto) {
    if (typeof listaProdutosGlobal !== 'undefined' && Array.isArray(listaProdutosGlobal)) {
        const produto = listaProdutosGlobal.find(p => p.nome && p.nome.toLowerCase() === nomeProduto.toLowerCase());
        if (produto) {
            // Preenche modal exclusivo de leitura
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

            // Foto do Produto
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

            // Insumos / Tags
            const containerInsumo = document.getElementById('detalhe-prod-insumo');
            if (containerInsumo) {
                if (produto.insumo_padrao) {
                    const tags = produto.insumo_padrao.split(',').map(s => s.trim()).filter(Boolean);
                    containerInsumo.innerHTML = tags.map(t => `<span class="bg-indigo-950 border border-indigo-700/60 text-indigo-200 px-2 py-0.5 rounded text-[10px] font-semibold">🧵 ${t}</span>`).join('');
                } else {
                    containerInsumo.innerHTML = `<span class="text-slate-500 italic">-</span>`;
                }
            }

            // Links
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

// Inicializa a página
document.addEventListener('DOMContentLoaded', () => {
    carregarPedidos();
    if (typeof carregarProdutos === 'function') {
        carregarProdutos();
    }
});