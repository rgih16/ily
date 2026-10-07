// assets/js/modules/produtos.js

let listaProdutosGlobal = [];
let categoriaFiltroAtual = 'Todas';
let termoBuscaAtual = '';
let insumosSelecionadosModal = [];

async function carregarProdutos() {
    try {
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
        
        wrapperControles.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="relative flex-1">
                    <input type="text" id="input-busca-produto" oninput="filtrarPorTexto(this.value)" placeholder="🔍 Buscar por nome do produto, SKU ou insumo..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 pl-9">
                    <span class="absolute left-3 top-2.5 text-slate-500 text-xs">🔍</span>
                </div>
                <div id="contador-produtos-filtrados" class="text-xs text-slate-400 font-mono whitespace-nowrap">
                    0 produto(s)
                </div>
            </div>

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
    aplicarFiltrosEExibir();
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

    const contador = document.getElementById('contador-produtos-filtrados');
    if (contador) {
        contador.textContent = `Exibindo ${filtrados.length} de ${listaProdutosGlobal.length} SKU(s)`;
    }
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
                        <th class="p-3">Custo Est.</th>
                        <th class="p-3">Preço Base</th>
                        <th class="p-3 text-center">Pronta Entrega</th>
                        <th class="p-3 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-800/60 bg-slate-900/40">
    `;

    produtos.forEach(item => {
        const precoFormatado = Number(item.preco_base || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const custoFormatado = Number(item.custo_estimado || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
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
                <td class="p-3 font-mono text-slate-400">${custoFormatado}</td>
                <td class="p-3 font-mono font-bold text-emerald-400">${precoFormatado}</td>
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
        contadorAba.textContent = `${produtos.length} SKU(s) Cadastrado(s)`;
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

        // Gera nome único para o arquivo
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        const filePath = `produtos/${fileName}`;

        // Upload para o bucket
        const { data, error } = await _supabase.storage
            .from('produtos-imagens')
            .upload(filePath, file);

        if (error) throw error;

        // Obter URL pública
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
    }
    
    const input = document.getElementById('input-prod-insumo');
    if (input) input.value = '';

    const wrapper = document.getElementById('wrapper-input-insumo');
    if (wrapper) wrapper.classList.add('hidden');
}

function removerTagInsumo(index) {
    insumosSelecionadosModal.splice(index, 1);
    renderizarTagsInsumosModal();
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

function abrirModalNovoProduto() {
    const modal = document.getElementById('modal-novo-produto');
    if (!modal) return;
    
    const form = document.getElementById('form-produto');
    if (form) form.reset();

    insumosSelecionadosModal = [];
    renderizarTagsInsumosModal();
    configurarListenersInsumo();

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

    const dadosProduto = {
        nome: document.getElementById('input-prod-nome')?.value,
        sku: document.getElementById('input-prod-sku')?.value,
        categoria: document.getElementById('input-prod-categoria')?.value || 'Geral',
        imagem_url: document.getElementById('input-prod-imagem-url')?.value || null,
        tempo_impressao: document.getElementById('input-prod-tempo')?.value,
        peso_gramas: document.getElementById('input-prod-peso')?.value ? parseInt(document.getElementById('input-prod-peso').value, 10) : null,
        insumo_padrao: insumoFinal,
        bico_recomendado: document.getElementById('input-prod-bico')?.value || '0.4mm',
        custo_estimado: document.getElementById('input-prod-custo')?.value ? parseFloat(document.getElementById('input-prod-custo').value) : 0,
        preco_base: document.getElementById('input-prod-preco')?.value ? parseFloat(document.getElementById('input-prod-preco').value) : 0,
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

function abrirModalEditarProduto(id) {
    const produto = listaProdutosGlobal.find(p => p.id === id);
    if (!produto) return;

    if (document.getElementById('input-produto-id')) document.getElementById('input-produto-id').value = produto.id;
    if (document.getElementById('input-prod-nome')) document.getElementById('input-prod-nome').value = produto.nome || '';
    if (document.getElementById('input-prod-sku')) document.getElementById('input-prod-sku').value = produto.sku || '';
    if (document.getElementById('input-prod-categoria')) document.getElementById('input-prod-categoria').value = produto.categoria || 'Geral';
    if (document.getElementById('input-prod-imagem-url')) document.getElementById('input-prod-imagem-url').value = produto.imagem_url || '';
    
    const previewImg = document.getElementById('preview-foto-produto');
    const placeholder = document.getElementById('preview-foto-placeholder');
    const statusText = document.getElementById('upload-status-text');

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
    if (document.getElementById('input-prod-custo')) document.getElementById('input-prod-custo').value = produto.custo_estimado || '';
    if (document.getElementById('input-prod-preco')) document.getElementById('input-prod-preco').value = produto.preco_base || '';
    if (document.getElementById('input-prod-estoque')) document.getElementById('input-prod-estoque').value = produto.estoque_pronta_entrega || 0;
    if (document.getElementById('input-prod-ams')) document.getElementById('input-prod-ams').checked = !!produto.troca_cor_ams;
    if (document.getElementById('input-prod-gcode')) document.getElementById('input-prod-gcode').value = produto.gcode_link || '';
    if (document.getElementById('input-prod-insumos-extra')) document.getElementById('input-prod-insumos-extra').value = produto.insumos_adicionais || '';
    if (document.getElementById('input-prod-pos-processamento')) document.getElementById('input-prod-pos-processamento').value = produto.pos_processamento || '';
    if (document.getElementById('input-prod-link-modelo')) document.getElementById('input-prod-link-modelo').value = produto.link_modelo || '';

    const titulo = document.getElementById('modal-produto-titulo');
    if (titulo) titulo.innerText = '✏️ Editar Produto (SKU)';

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