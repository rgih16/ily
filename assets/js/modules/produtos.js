// assets/js/modules/produtos.js

let listaProdutosGlobal = [];
let categoriaFiltroAtual = 'Todas';
let termoBuscaAtual = '';
let insumosSelecionadosModal = [];

// Preenche a lista de sugestões de insumos do Catálogo com os filamentos cadastrados no Estoque (incluindo o ID)
async function carregarSugestoesInsumosCatalogo() {
    const datalist = document.getElementById('lista-insumos-sugeridos');
    if (!datalist) return;

    try {
        const { data: filamentos, error } = await _supabase
            .from('filamentos')
            .select('id, material, cor')
            .order('material', { ascending: true })
            .order('cor', { ascending: true });

        if (error) throw error;

        datalist.innerHTML = '';

        (filamentos || []).forEach(f => {
            const nomeFormatado = `[ID:${f.id}] ${f.material} ${f.cor}`;
            datalist.innerHTML += `<option value="${nomeFormatado}">`;
        });
    } catch (err) {
        console.error('Erro ao carregar insumos do estoque para o catálogo:', err);
    }
}

async function carregarProdutos() {
    try {
        // A precificação usa os parâmetros financeiros e o custo médio dos filamentos
        if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
        if (typeof carregarFilamentos === 'function' && (typeof listaFilamentosGlobal === 'undefined' || listaFilamentosGlobal.length === 0)) {
            await carregarFilamentos();
        }

        const { data, error } = await _supabase
            .from('produtos')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        listaProdutosGlobal = data || [];
        renderizarFiltrosEBarraBusca();
        aplicarFiltrosEExibir();
        atualizarSelectProdutosModal(listaProdutosGlobal);
    } catch (err) {
        console.error('Erro ao carregar catálogo de produtos:', err.message);
    }
}

function renderizarFiltrosEBarraBusca() {
    const container = document.getElementById('tabela-catalogo-container');
    if (!container) return;

    const categoriasBase = [
        'Todas', 
        'Geek & Games', 
        'Casa & Decoração', 
        'Vasos & Jardinagem', 
        'Luminárias & Iluminação', 
        'Utilidades & Acessórios', 
        'Escritório & Setup', 
        'Colecionáveis & Action Figures'
    ];
    
    const categoriasSet = new Set(categoriasBase);
    listaProdutosGlobal.forEach(p => {
        if (p.categoria) categoriasSet.add(p.categoria);
    });
    const categorias = Array.from(categoriasSet);

    let controlesHtml = document.getElementById('catalogo-controles');
    if (!controlesHtml) {
        const wrapperControles = document.createElement('div');
        wrapperControles.id = 'catalogo-controles';
        wrapperControles.className = 'space-y-3 mb-4';
        
        // A busca fica no topo da aba (index.html), no mesmo padrão da Gestão de Pedidos
        wrapperControles.innerHTML = `
            <div id="pílulas-categorias" class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            </div>
        `;
        
        if (container.parentNode) {
            container.parentNode.insertBefore(wrapperControles, container);
        }
    }

    const containerPilulas = document.getElementById('pílulas-categorias');
    if (containerPilulas) {
        containerPilulas.innerHTML = categorias.map(cat => `
            <button onclick="filtrarPorCategoria('${cat}')" class="px-3 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition ${categoriaFiltroAtual === cat ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}">
                ${cat}
            </button>
        `).join('');
    }
}

function filtrarPorTexto(texto) {
    termoBuscaAtual = texto.toLowerCase().trim();
    document.getElementById('btn-limpar-busca-produto')?.classList.toggle('hidden', !termoBuscaAtual);
    aplicarFiltrosEExibir();
}

function limparBuscaProdutos() {
    const input = document.getElementById('input-busca-produto');
    if (input) input.value = '';
    filtrarPorTexto('');
}

function filtrarPorCategoria(categoria) {
    categoriaFiltroAtual = categoria;
    renderizarFiltrosEBarraBusca();
    aplicarFiltrosEExibir();
}

function aplicarFiltrosEExibir() {
    let filtrados = listaProdutosGlobal.filter(p => {
        const atendeCategoria = categoriaFiltroAtual === 'Todas' || p.categoria === categoriaFiltroAtual;
        const atendeTexto = !termoBuscaAtual || 
            (p.nome && p.nome.toLowerCase().includes(termoBuscaAtual)) ||
            (p.sku && p.sku.toLowerCase().includes(termoBuscaAtual)) ||
            (p.insumo_padrao && p.insumo_padrao.toLowerCase().includes(termoBuscaAtual));

        return atendeCategoria && atendeTexto;
    });

    renderizarTabelaProdutos(filtrados);
}

function renderizarTabelaProdutos(produtos) {
    const container = document.getElementById('tabela-catalogo-container');
    if (!container) return;

    if (produtos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                Nenhum produto encontrado no catálogo.
            </div>
        `;
        return;
    }

    let html = `
        <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full text-left text-xs text-slate-300">
                <thead class="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                        <th class="p-3">Foto</th>
                        <th class="p-3">SKU</th>
                        <th class="p-3">Produto</th>
                        <th class="p-3">Categoria</th>
                        <th class="p-3">Insumo / Bico</th>
                        <th class="p-3">Tempo / Peso</th>
                        <th class="p-3">Custo</th>
                        <th class="p-3">Preço por canal</th>
                        <th class="p-3 text-center">Pronta Entrega</th>
                        <th class="p-3 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/60 bg-slate-900/40">
    `;

    // Cores das bolinhas de canal (mesmas classes do Kanban)
    const corCanalLista = { 'Shopee': 'bg-shopee', 'Mercado Livre': 'bg-ml', 'Site': 'bg-site', 'WhatsApp': 'bg-wts' };

    produtos.forEach(item => {
        // Custo e preços calculados na hora com os parâmetros atuais
        const precificacao = typeof precificacaoProduto === 'function' ? precificacaoProduto(item) : null;
        const custoFormatado = moedaProduto(precificacao ? precificacao.custo.total : item.custo_estimado);
        const precosCanais = precificacao
            ? CANAIS_VENDA.map(canal => {
                const info = precificacao.canais[canal];
                return `<div class="flex items-center justify-between gap-2 whitespace-nowrap">
                    <span class="flex items-center gap-1 text-[10px] text-slate-400"><span class="w-1.5 h-1.5 rounded-full ${corCanalLista[canal]}"></span>${canal}</span>
                    <span class="text-emerald-400 font-bold">${moedaProduto(info.preco)}${info.fixo ? ' <span class="text-[9px] text-amber-400" title="Preço fixado à mão">●</span>' : ''}</span>
                </div>`;
            }).join('')
            : `<span class="text-emerald-400 font-bold">${moedaProduto(item.preco_base)}</span>`;

        html += `
            <tr class="hover:bg-slate-800/40 transition">
                <td class="p-3">
                    ${item.imagem_url ? `
                        <img src="${item.imagem_url}" alt="${item.nome}" class="w-9 h-9 rounded-lg object-cover border border-slate-800">
                    ` : `
                        <div class="w-9 h-9 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-sm text-slate-500">📦</div>
                    `}
                </td>
                <td class="p-3 font-mono text-indigo-400 font-bold">${item.sku || '-'}</td>
                <td class="p-3 font-semibold text-white">
                    <div class="flex items-center gap-1.5">
                        <span onclick="abrirDetalhesProdutoPorNome('${item.nome}')" class="hover:text-indigo-400 cursor-pointer transition">${item.nome}</span>
                        ${item.troca_cor_ams ? '<span class="text-[9px] bg-indigo-900/80 text-indigo-300 px-1.5 py-0.2 rounded border border-indigo-700/50" title="Exige AMS / Troca de cor">🎨 Multicor</span>' : ''}
                    </div>
                </td>
                <td class="p-3">
                    <span class="bg-slate-800/80 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">
                        ${item.categoria || 'Geral'}
                    </span>
                </td>
                <td class="p-3">
                    <div class="text-slate-200">${item.insumo_padrao || '-'}</div>
                    <div class="text-[10px] text-slate-500 font-mono">bico: ${item.bico_recomendado || '0.4mm'}</div>
                </td>
                <td class="p-3 font-mono">
                    <div class="text-amber-400">⏱️ ${item.tempo_impressao || '-'}</div>
                    <div class="text-slate-400 text-[10px]">${item.peso_gramas ? item.peso_gramas + 'g' : '-'}</div>
                </td>
                <td class="p-3 font-mono text-slate-400">
                    <div>${custoFormatado}</div>
                    ${precificacao ? `<div class="text-[10px] text-slate-500">margem ${precificacao.margem.pct.toLocaleString('pt-BR')}%</div>` : ''}
                </td>
                <td class="p-3 font-mono space-y-0.5 min-w-[150px]">${precosCanais}</td>
                <td class="p-3 text-center font-mono">
                    <span class="px-2 py-0.5 rounded border text-[11px] ${item.estoque_pronta_entrega > 0 ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400 font-bold' : 'bg-slate-950 border-slate-800 text-slate-600'}">
                        📦 ${item.estoque_pronta_entrega || 0}
                    </span>
                </td>
                <td class="p-3 text-right space-x-2">
                    <button onclick="abrirModalEditarProduto(${item.id})" class="text-slate-400 hover:text-indigo-400 transition" title="Editar SKU">✏️</button>
                    <button onclick="excluirProduto(${item.id})" class="text-slate-400 hover:text-red-400 transition" title="Excluir SKU">🗑️</button>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;

    const contadorAba = document.querySelector('#aba-catalogo span span:last-child');
    if (contadorAba) {
        // Total cadastrado, não o resultado da busca/filtro
        contadorAba.textContent = `${listaProdutosGlobal.length} SKU(s) Cadastrado(s)`;
    }
}

function atualizarSelectProdutosModal(produtos) {
    const select = document.getElementById('input-produto-sku');
    if (!select) return;

    let html = `<option value="">-- Escolha um Produto --</option>`;
    produtos.forEach(p => {
        html += `<option value="${p.id}" data-sku="${p.sku || ''}" data-nome="${p.nome}" data-tempo="${p.tempo_impressao || ''}" data-preco="${p.preco_base || 0}" data-insumo="${p.insumo_padrao || ''}">${p.sku ? '[' + p.sku + '] ' : ''}${p.nome}</option>`;
    });

    select.innerHTML = html;
}

// LÓGICA DE UPLOAD DE IMAGEM DO COMPUTADOR PARA O SUPABASE STORAGE
async function previewEUploadImagem(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusText = document.getElementById('upload-status-text');
    const previewImg = document.getElementById('preview-foto-produto');
    const placeholder = document.getElementById('preview-foto-placeholder');
    const inputUrl = document.getElementById('input-prod-imagem-url');
    const btnSalvar = document.getElementById('btn-salvar-produto');

    try {
        if (statusText) statusText.textContent = '⏳ Enviando foto...';
        if (btnSalvar) btnSalvar.disabled = true;

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        const filePath = `produtos/${fileName}`;

        const { data, error } = await _supabase.storage
            .from('produtos-imagens')
            .upload(filePath, file);

        if (error) throw error;

        const { data: publicData } = _supabase.storage
            .from('produtos-imagens')
            .getPublicUrl(filePath);

        const urlFinal = publicData.publicUrl;

        if (inputUrl) inputUrl.value = urlFinal;
        if (previewImg) {
            previewImg.src = urlFinal;
            previewImg.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (statusText) statusText.textContent = '✅ Imagem salva com sucesso!';

    } catch (err) {
        console.error('Erro no upload da imagem:', err);
        if (statusText) statusText.textContent = '❌ Erro ao enviar foto.';
        alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
        if (btnSalvar) btnSalvar.disabled = false;
    }
}

// SELEÇÃO MÚLTIPLA DE INSUMOS
function toggleInputInsumo() {
    const wrapper = document.getElementById('wrapper-input-insumo');
    const input = document.getElementById('input-prod-insumo');
    if (!wrapper || !input) return;

    if (wrapper.classList.contains('hidden')) {
        wrapper.classList.remove('hidden');
        input.focus();
    } else {
        wrapper.classList.add('hidden');
    }
}

function adicionarTagInsumo(nomeInsumo) {
    const limpo = nomeInsumo.trim();
    if (!limpo) return;

    if (!insumosSelecionadosModal.includes(limpo)) {
        insumosSelecionadosModal.push(limpo);
        renderizarTagsInsumosModal();
        atualizarPrecificacaoModal();
    }
    
    const input = document.getElementById('input-prod-insumo');
    if (input) input.value = '';

    const wrapper = document.getElementById('wrapper-input-insumo');
    if (wrapper) wrapper.classList.add('hidden');
}

function removerTagInsumo(index) {
    insumosSelecionadosModal.splice(index, 1);
    renderizarTagsInsumosModal();
    atualizarPrecificacaoModal();
}

// ==========================================
// PRECIFICAÇÃO NO CADASTRO DO PRODUTO
// ==========================================
const moedaProduto = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const idCanalPreco = (canal) => canal.toLowerCase().replace(/\s+/g, '-');

// Produto "em edição" montado a partir do formulário, para o cálculo ao vivo
function produtoDoFormularioPreco() {
    const num = (id) => {
        const v = document.getElementById(id)?.value;
        return v === '' || v == null ? null : parseFloat(v);
    };
    const precos_fixos = {};
    CANAIS_VENDA.forEach(canal => {
        const v = num(`input-prod-preco-${idCanalPreco(canal)}`);
        if (v > 0) precos_fixos[canal] = v;
    });
    return {
        peso_gramas: num('input-prod-peso') || 0,
        tempo_impressao: document.getElementById('input-prod-tempo')?.value || '',
        insumo_padrao: insumosSelecionadosModal.join(', '),
        custo_embalagem: num('input-prod-embalagem') || 0,
        margem_pct: num('input-prod-margem'),
        precos_fixos
    };
}

// Monta a tabela de preços por canal (os campos de preço ficam; só os textos são atualizados ao digitar)
function montarTabelaPrecosModal(fixos = {}) {
    const el = document.getElementById('prod-tabela-precos');
    if (!el) return;
    el.innerHTML = `
        <div class="grid grid-cols-[1.3fr_0.7fr_1fr_1.1fr_1fr_1fr] gap-x-2 gap-y-1 items-center text-[11px]">
            <span class="text-slate-500 font-semibold">Canal</span>
            <span class="text-slate-500 font-semibold text-right">Taxa</span>
            <span class="text-slate-500 font-semibold text-right">Sugerido</span>
            <span class="text-slate-500 font-semibold text-center">Preço</span>
            <span class="text-slate-500 font-semibold text-right">Você recebe</span>
            <span class="text-slate-500 font-semibold text-right">Lucro</span>
            ${CANAIS_VENDA.map(canal => {
                const id = idCanalPreco(canal);
                return `
                <span class="text-slate-200 font-semibold">${canal}</span>
                <span id="prod-taxa-${id}" class="text-right text-slate-400 font-mono"></span>
                <span id="prod-sugerido-${id}" class="text-right text-slate-300 font-mono"></span>
                <input type="number" step="0.01" min="0" id="input-prod-preco-${id}" value="${Number(fixos[canal]) > 0 ? fixos[canal] : ''}" oninput="atualizarPrecificacaoModal()" class="w-full bg-slate-950 border border-slate-800 rounded-md p-1 text-xs text-slate-100 text-center focus:outline-none focus:border-indigo-500">
                <span id="prod-recebe-${id}" class="text-right text-emerald-300 font-mono"></span>
                <span id="prod-lucro-${id}" class="text-right font-mono"></span>`;
            }).join('')}
        </div>`;
}

function atualizarPrecificacaoModal() {
    if (typeof precificacaoProduto !== 'function' || !document.getElementById('prod-resumo-custo')) return;
    const produto = produtoDoFormularioPreco();
    const p = precificacaoProduto(produto);
    const c = p.custo;

    const margemInput = document.getElementById('input-prod-margem');
    if (margemInput) margemInput.placeholder = `padrão: ${Number(configFinanceira.margem_padrao_pct ?? 100)}%`;

    const linha = (rotulo, valor, extra = '', classe = 'text-slate-300') =>
        `<div class="flex justify-between gap-2"><span class="text-slate-400">${rotulo}${extra ? ` <span class="text-slate-500">${extra}</span>` : ''}</span><span class="font-mono ${classe}">${valor}</span></div>`;
    document.getElementById('prod-resumo-custo').innerHTML = `
        ${linha('Filamento', moedaProduto(c.filamento), `${c.peso}g × ${moedaProduto(c.custoG)}/g${c.filamentoEstimado ? ' (custo padrão: filamento não achado no estoque)' : ''}`)}
        ${linha('Máquina', moedaProduto(c.maquina), `${c.horas.toFixed(2).replace('.', ',')} h × ${moedaProduto(custoHoraImpressao())}/h`)}
        ${linha('Embalagem e insumos', moedaProduto(c.embalagem))}
        <div class="flex justify-between gap-2 border-t border-slate-800 pt-1 font-semibold"><span class="text-slate-200">(=) Custo de produção</span><span class="font-mono text-slate-100">${moedaProduto(c.total)}</span></div>
        ${linha('Margem', `${p.margem.pct.toLocaleString('pt-BR')}%`, p.margem.origem === 'padrao' ? '(padrão)' : '')}
        <div class="flex justify-between gap-2 font-semibold"><span class="text-slate-200">(=) Você quer receber por unidade</span><span class="font-mono text-emerald-300">${moedaProduto(p.alvo)}</span></div>
    `;

    CANAIS_VENDA.forEach(canal => {
        const id = idCanalPreco(canal);
        const info = p.canais[canal];
        const set = (pref, txt, classe) => {
            const e = document.getElementById(`${pref}-${id}`);
            if (!e) return;
            e.textContent = txt;
            if (classe) e.className = classe;
        };
        set('prod-taxa', `${info.pct.toLocaleString('pt-BR')}%`);
        set('prod-sugerido', moedaProduto(info.sugerido));
        const input = document.getElementById(`input-prod-preco-${id}`);
        if (input) input.placeholder = info.sugerido.toFixed(2);
        set('prod-recebe', moedaProduto(info.recebe));
        set('prod-lucro', moedaProduto(info.lucro), `text-right font-mono ${info.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`);
    });
}

// Abre a seção de precificação do modal com os dados do produto (ou vazia, no cadastro)
async function prepararPrecificacaoModal(produto = null) {
    if (typeof carregarConfigFinanceira === 'function') await carregarConfigFinanceira();
    if (typeof carregarFilamentos === 'function' && (typeof listaFilamentosGlobal === 'undefined' || listaFilamentosGlobal.length === 0)) {
        await carregarFilamentos();
    }
    document.getElementById('input-prod-embalagem').value = produto && Number(produto.custo_embalagem) > 0 ? produto.custo_embalagem : '';
    // Produto antigo sem margem gravada: preenche a margem que reproduz o preço atual, para nada mudar ao salvar
    let margem = '';
    if (produto) {
        const m = margemDoProduto(produto, custoProducaoProduto(produto).total);
        if (m.origem !== 'padrao') margem = m.pct;
    }
    document.getElementById('input-prod-margem').value = margem;
    montarTabelaPrecosModal(produto?.precos_fixos || {});
    atualizarPrecificacaoModal();
}

function renderizarTagsInsumosModal() {
    const container = document.getElementById('container-tags-insumos');
    if (!container) return;

    if (insumosSelecionadosModal.length === 0) {
        container.innerHTML = `<span class="text-[10px] text-slate-500 italic">Nenhum insumo selecionado</span>`;
        return;
    }

    container.innerHTML = insumosSelecionadosModal.map((insumo, index) => `
        <span class="inline-flex items-center gap-1 bg-indigo-950/80 border border-indigo-700/60 text-indigo-200 text-[10px] font-semibold px-2 py-1 rounded-md">
            🧵 ${insumo}
            <button type="button" onclick="removerTagInsumo(${index})" class="text-indigo-400 hover:text-red-400 font-bold ml-1">✕</button>
        </span>
    `).join('');
}

function configurarListenersInsumo() {
    const input = document.getElementById('input-prod-insumo');
    if (!input) return;

    const novoInput = input.cloneNode(true);
    input.parentNode.replaceChild(novoInput, input);

    novoInput.addEventListener('change', (e) => {
        adicionarTagInsumo(e.target.value);
    });

    novoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            adicionarTagInsumo(novoInput.value);
        }
    });
}

async function abrirModalNovoProduto() {
    const modal = document.getElementById('modal-novo-produto');
    if (!modal) return;
    
    const form = document.getElementById('form-produto');
    if (form) form.reset();

    insumosSelecionadosModal = [];
    renderizarTagsInsumosModal();
    configurarListenersInsumo();
    await carregarSugestoesInsumosCatalogo();

    const wrapperInput = document.getElementById('wrapper-input-insumo');
    if (wrapperInput) wrapperInput.classList.add('hidden');

    const inputId = document.getElementById('input-produto-id');
    if (inputId) inputId.value = '';

    const inputUrl = document.getElementById('input-prod-imagem-url');
    if (inputUrl) inputUrl.value = '';

    const previewImg = document.getElementById('preview-foto-produto');
    const placeholder = document.getElementById('preview-foto-placeholder');
    if (previewImg) previewImg.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');

    const statusText = document.getElementById('upload-status-text');
    if (statusText) statusText.textContent = 'Nenhum arquivo enviado';

    const titulo = document.getElementById('modal-produto-titulo');
    if (titulo) titulo.innerText = '📦 Cadastrar Novo Produto (SKU)';

    await prepararPrecificacaoModal();
    modal.classList.remove('hidden');
}

function fecharModalNovoProduto() {
    const modal = document.getElementById('modal-novo-produto');
    if (modal) modal.classList.add('hidden');
}

async function salvarProduto(event) {
    if (event) event.preventDefault();

    const id = document.getElementById('input-produto-id')?.value;

    const insumoInputVal = document.getElementById('input-prod-insumo')?.value;
    if (insumoInputVal && insumoInputVal.trim()) {
        if (!insumosSelecionadosModal.includes(insumoInputVal.trim())) {
            insumosSelecionadosModal.push(insumoInputVal.trim());
        }
    }

    const insumoFinal = insumosSelecionadosModal.join(', ');

    // Custo e preços vêm da precificação; preco_base = preço da venda direta (WhatsApp/Pix)
    const formPreco = produtoDoFormularioPreco();
    const precificacao = precificacaoProduto(formPreco);

    const dadosProduto = {
        nome: document.getElementById('input-prod-nome')?.value,
        sku: document.getElementById('input-prod-sku')?.value,
        categoria: document.getElementById('input-prod-categoria')?.value || 'Geral',
        imagem_url: document.getElementById('input-prod-imagem-url')?.value || null,
        tempo_impressao: document.getElementById('input-prod-tempo')?.value,
        peso_gramas: document.getElementById('input-prod-peso')?.value ? parseInt(document.getElementById('input-prod-peso').value, 10) : null,
        insumo_padrao: insumoFinal,
        bico_recomendado: document.getElementById('input-prod-bico')?.value || '0.4mm',
        custo_estimado: Math.round(precificacao.custo.total * 100) / 100,
        preco_base: precificacao.canais['WhatsApp'].preco,
        custo_embalagem: formPreco.custo_embalagem,
        margem_pct: formPreco.margem_pct,
        precos_fixos: formPreco.precos_fixos,
        estoque_pronta_entrega: document.getElementById('input-prod-estoque')?.value ? parseInt(document.getElementById('input-prod-estoque').value, 10) : 0,
        troca_cor_ams: document.getElementById('input-prod-ams')?.checked || insumosSelecionadosModal.length > 1,
        gcode_link: document.getElementById('input-prod-gcode')?.value || '',
        insumos_adicionais: document.getElementById('input-prod-insumos-extra')?.value || '',
        pos_processamento: document.getElementById('input-prod-pos-processamento')?.value || '',
        link_modelo: document.getElementById('input-prod-link-modelo')?.value || ''
    };

    try {
        let error;
        if (id) {
            const res = await _supabase.from('produtos').update(dadosProduto).eq('id', id);
            error = res.error;
        } else {
            const res = await _supabase.from('produtos').insert([dadosProduto]);
            error = res.error;
        }

        if (error) throw error;

        fecharModalNovoProduto();
        await carregarProdutos();
    } catch (err) {
        alert('Erro ao salvar produto: ' + err.message);
    }
}

async function abrirModalEditarProduto(id) {
    const produto = listaProdutosGlobal.find(p => p.id === id);
    if (!produto) return;

    await carregarSugestoesInsumosCatalogo();

    if (document.getElementById('input-produto-id')) document.getElementById('input-produto-id').value = produto.id;
    if (document.getElementById('input-prod-nome')) document.getElementById('input-prod-nome').value = produto.nome || '';
    if (document.getElementById('input-prod-sku')) document.getElementById('input-prod-sku').value = produto.sku || '';
    if (document.getElementById('input-prod-categoria')) document.getElementById('input-prod-categoria').value = produto.categoria || 'Geral';
    if (document.getElementById('input-prod-imagem-url')) document.getElementById('input-prod-imagem-url').value = produto.imagem_url || '';
    
    const previewImg = document.getElementById('preview-foto-produto');
    const placeholder = document.getElementById('preview-foto-placeholder');
    const statusText = document.getElementById('upload-status-text');

    // O formulário não é resetado na edição: sem isso, o campo mostraria o nome do arquivo enviado no produto anterior
    const inputArquivo = document.getElementById('input-prod-arquivo');
    if (inputArquivo) inputArquivo.value = '';

    if (produto.imagem_url && previewImg && placeholder) {
        previewImg.src = produto.imagem_url;
        previewImg.classList.remove('hidden');
        placeholder.classList.add('hidden');
        if (statusText) statusText.textContent = 'Imagem cadastrada';
    } else {
        if (previewImg) previewImg.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
        if (statusText) statusText.textContent = 'Nenhum arquivo enviado';
    }

    if (document.getElementById('input-prod-tempo')) document.getElementById('input-prod-tempo').value = produto.tempo_impressao || '';
    if (document.getElementById('input-prod-peso')) document.getElementById('input-prod-peso').value = produto.peso_gramas || '';
    
    if (produto.insumo_padrao) {
        insumosSelecionadosModal = produto.insumo_padrao.split(',').map(s => s.trim()).filter(Boolean);
    } else {
        insumosSelecionadosModal = [];
    }
    renderizarTagsInsumosModal();
    configurarListenersInsumo();

    const wrapperInput = document.getElementById('wrapper-input-insumo');
    if (wrapperInput) wrapperInput.classList.add('hidden');

    if (document.getElementById('input-prod-bico')) document.getElementById('input-prod-bico').value = produto.bico_recomendado || '0.4mm';
    if (document.getElementById('input-prod-estoque')) document.getElementById('input-prod-estoque').value = produto.estoque_pronta_entrega || 0;
    if (document.getElementById('input-prod-ams')) document.getElementById('input-prod-ams').checked = !!produto.troca_cor_ams;
    if (document.getElementById('input-prod-gcode')) document.getElementById('input-prod-gcode').value = produto.gcode_link || '';
    if (document.getElementById('input-prod-insumos-extra')) document.getElementById('input-prod-insumos-extra').value = produto.insumos_adicionais || '';
    if (document.getElementById('input-prod-pos-processamento')) document.getElementById('input-prod-pos-processamento').value = produto.pos_processamento || '';
    if (document.getElementById('input-prod-link-modelo')) document.getElementById('input-prod-link-modelo').value = produto.link_modelo || '';

    const titulo = document.getElementById('modal-produto-titulo');
    if (titulo) titulo.innerText = '✏️ Editar Produto (SKU)';

    await prepararPrecificacaoModal(produto);
    const modal = document.getElementById('modal-novo-produto');
    if (modal) modal.classList.remove('hidden');
}

async function excluirProduto(id) {
    if (!confirm('Tem certeza que deseja excluir este produto do catálogo?')) return;

    try {
        const { error } = await _supabase.from('produtos').delete().eq('id', id);
        if (error) throw error;
        
        await carregarProdutos();
    } catch (err) {
        alert('Erro ao excluir produto: ' + err.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    carregarProdutos();
});