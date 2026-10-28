// assets/js/modules/financas.js

let visaoFinanceiraAtual = 'competencia'; // 'competencia' ou 'caixa'
let listaCustosFixosGlobal = [];
let listaConsumiveisGlobal = [];
let chartEvolucaoInstance = null;
let chartCanaisInstance = null;

// Configuração padrão de taxas/comissões por canal de venda (%)
let taxasCanaisConfig = {
    'Shopee': 15,
    'Mercado Livre': 10,
    'Site': 3,
    'WhatsApp': 0
};

// Função auxiliar para obter o cliente Supabase em qualquer escopo
function obterSupabaseClient() {
    if (typeof _supabase !== 'undefined' && _supabase) return _supabase;
    if (typeof window !== 'undefined') {
        if (window._supabase) return window._supabase;
        if (window.supabaseClient) return window.supabaseClient;
    }
    return null;
}

// Extrai ano e mês de forma à prova de fusos horários
function extrairAnoMes(dataValor) {
    if (!dataValor) return null;
    const str = String(dataValor).trim();
    const match = str.match(/^(\d{4})-(\d{2})/);
    if (match) {
        return { ano: match[1], mes: match[2] };
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        return {
            ano: String(d.getFullYear()),
            mes: String(d.getMonth() + 1).padStart(2, '0')
        };
    }
    return null;
}

// Função Global do Accordion
function toggleAccordion(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (el) {
        const estaEscondido = el.classList.contains('hidden');
        if (estaEscondido) {
            el.classList.remove('hidden');
            if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
            el.classList.add('hidden');
            if (icon) icon.style.transform = 'rotate(-90deg)';
        }
    }
}

function carregarTaxasSalvas() {
    const salvos = localStorage.getItem('ilumy3d_taxas_canais');
    if (salvos) {
        try {
            taxasCanaisConfig = { ...taxasCanaisConfig, ...JSON.parse(salvos) };
        } catch (e) {
            console.error('Erro ao ler taxas do localStorage:', e);
        }
    }
}

function inicializarModuloFinancas() {
    carregarTaxasSalvas();
    const inputMes = document.getElementById('filtro-financas-mes');
    if (inputMes && !inputMes.value) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        inputMes.value = `${ano}-${mes}`;
    }
    carregarCustosFixos();
    carregarConsumiveis();
    carregarDadosFinanceiros();
}

function alternarVisaoFinanceira(visao) {
    visaoFinanceiraAtual = visao;
    
    const btnComp = document.getElementById('btn-visao-competencia');
    const btnCaixa = document.getElementById('btn-visao-caixa');

    if (visao === 'competencia') {
        if (btnComp) btnComp.className = 'px-3 py-1.5 rounded-lg transition bg-indigo-600 text-white shadow';
        if (btnCaixa) btnCaixa.className = 'px-3 py-1.5 rounded-lg transition text-slate-400 hover:text-white';
    } else {
        if (btnCaixa) btnCaixa.className = 'px-3 py-1.5 rounded-lg transition bg-emerald-600 text-white shadow';
        if (btnComp) btnComp.className = 'px-3 py-1.5 rounded-lg transition text-slate-400 hover:text-white';
    }

    carregarDadosFinanceiros();
}

// MODAL DE CONFIGURAÇÃO DE TAXAS POR CANAL
function abrirModalConfigurarTaxas() {
    carregarTaxasSalvas();
    
    const elShopee = document.getElementById('input-taxa-shopee');
    const elMl = document.getElementById('input-taxa-ml');
    const elSite = document.getElementById('input-taxa-site');
    const elWts = document.getElementById('input-taxa-wts');

    if (elShopee) elShopee.value = taxasCanaisConfig['Shopee'] !== undefined ? taxasCanaisConfig['Shopee'] : 15;
    if (elMl) elMl.value = taxasCanaisConfig['Mercado Livre'] !== undefined ? taxasCanaisConfig['Mercado Livre'] : 10;
    if (elSite) elSite.value = taxasCanaisConfig['Site'] !== undefined ? taxasCanaisConfig['Site'] : 3;
    if (elWts) elWts.value = taxasCanaisConfig['WhatsApp'] !== undefined ? taxasCanaisConfig['WhatsApp'] : 0;

    const modal = document.getElementById('modal-configurar-taxas');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalConfigurarTaxas() {
    const modal = document.getElementById('modal-configurar-taxas');
    if (modal) modal.classList.add('hidden');
}

function salvarConfiguracaoTaxas(e) {
    if (e) e.preventDefault();

    const shopee = parseFloat(document.getElementById('input-taxa-shopee')?.value) || 0;
    const ml = parseFloat(document.getElementById('input-taxa-ml')?.value) || 0;
    const site = parseFloat(document.getElementById('input-taxa-site')?.value) || 0;
    const wts = parseFloat(document.getElementById('input-taxa-wts')?.value) || 0;

    taxasCanaisConfig = {
        'Shopee': shopee,
        'Mercado Livre': ml,
        'Site': site,
        'WhatsApp': wts
    };

    localStorage.setItem('ilumy3d_taxas_canais', JSON.stringify(taxasCanaisConfig));
    fecharModalConfigurarTaxas();
    carregarDadosFinanceiros();
}

// ==========================================
// CRUD: CUSTOS FIXOS
// ==========================================
async function carregarCustosFixos() {
    try {
        const client = obterSupabaseClient();
        if (!client) return;

        const { data, error } = await client
            .from('custos_fixos')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        listaCustosFixosGlobal = data || [];
        renderizarTabelaCustosFixos();
    } catch (err) {
        console.error('Erro ao carregar custos fixos:', err.message);
    }
}

function renderizarTabelaCustosFixos() {
    const tbody = document.getElementById('tabela-custos-fixos-body');
    if (!tbody) return;

    if (listaCustosFixosGlobal.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="py-3 text-center text-slate-500 italic text-[11px]">Nenhum custo fixo cadastrado.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = listaCustosFixosGlobal.map(c => `
        <tr class="hover:bg-slate-800/40 border-b border-slate-800/50">
            <td class="py-2 px-1 font-semibold text-slate-200 truncate max-w-[100px]">${c.nome || '-'}</td>
            <td class="py-2 px-1 font-mono text-slate-300">R$ ${Number(c.valor || 0).toFixed(2)}</td>
            <td class="py-2 px-1 font-mono text-slate-400 text-center">Dia ${c.dia_vencimento || '-'}</td>
            <td class="py-2 px-1 text-right space-x-1 whitespace-nowrap">
                <button onclick="abrirModalEditarCustoFixo(${c.id})" class="p-1 text-slate-400 hover:text-indigo-400 transition" title="Editar">✏️</button>
                <button onclick="excluirCustoFixo(${c.id})" class="p-1 text-slate-400 hover:text-red-400 transition" title="Excluir">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function salvarNovoCustoFixo(e) {
    if (e) e.preventDefault();

    const nome = document.getElementById('input-custo-nome')?.value?.trim();
    const valor = parseFloat(document.getElementById('input-custo-valor')?.value) || 0;
    const dia = parseInt(document.getElementById('input-custo-dia')?.value, 10) || 1;

    if (!nome || valor <= 0) {
        alert('Por favor, preencha o nome e um valor válido.');
        return;
    }

    try {
        const client = obterSupabaseClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client
            .from('custos_fixos')
            .insert([{ nome, valor, dia_vencimento: dia }]);

        if (error) throw error;

        fecharModalCustoFixo();
        await carregarCustosFixos();
        await carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao salvar custo fixo: ' + err.message);
    }
}

function abrirModalEditarCustoFixo(id) {
    const custo = listaCustosFixosGlobal.find(c => c.id === id);
    if (!custo) return;

    if (document.getElementById('input-editar-custo-id')) document.getElementById('input-editar-custo-id').value = custo.id;
    if (document.getElementById('input-editar-custo-nome')) document.getElementById('input-editar-custo-nome').value = custo.nome || '';
    if (document.getElementById('input-editar-custo-valor')) document.getElementById('input-editar-custo-valor').value = custo.valor || 0;
    if (document.getElementById('input-editar-custo-dia')) document.getElementById('input-editar-custo-dia').value = custo.dia_vencimento || 10;

    const modal = document.getElementById('modal-editar-custo-fixo');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalEditarCustoFixo() {
    const modal = document.getElementById('modal-editar-custo-fixo');
    if (modal) modal.classList.add('hidden');
}

async function salvarEdicaoCustoFixo(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('input-editar-custo-id')?.value;
    const nome = document.getElementById('input-editar-custo-nome')?.value?.trim();
    const valor = parseFloat(document.getElementById('input-editar-custo-valor')?.value) || 0;
    const dia = parseInt(document.getElementById('input-editar-custo-dia')?.value, 10) || 1;

    if (!id || !nome || valor <= 0) {
        alert('Por favor, preencha os campos corretamente.');
        return;
    }

    try {
        const client = obterSupabaseClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client
            .from('custos_fixos')
            .update({ nome, valor, dia_vencimento: dia })
            .eq('id', id);

        if (error) throw error;

        fecharModalEditarCustoFixo();
        await carregarCustosFixos();
        await carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao atualizar custo fixo: ' + err.message);
    }
}

async function excluirCustoFixo(id) {
    if (!confirm('Deseja excluir este custo fixo?')) return;

    try {
        const client = obterSupabaseClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client.from('custos_fixos').delete().eq('id', id);
        if (error) throw error;

        await carregarCustosFixos();
        await carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao excluir custo fixo: ' + err.message);
    }
}

function abrirModalCustoFixo() {
    const modal = document.getElementById('modal-custo-fixo');
    if (modal) {
        document.getElementById('form-custo-fixo')?.reset();
        modal.classList.remove('hidden');
    }
}

function fecharModalCustoFixo() {
    const modal = document.getElementById('modal-custo-fixo');
    if (modal) modal.classList.add('hidden');
}

// ==========================================
// CRUD: CONSUMÍVEIS E INSUMOS
// ==========================================
async function carregarConsumiveis() {
    try {
        const client = obterSupabaseClient();
        if (!client) return;

        const { data, error } = await client
            .from('consumiveis_mensais')
            .select('*')
            .order('data_compra', { ascending: false });

        if (error) throw error;

        listaConsumiveisGlobal = data || [];
        filtrarERenderizarConsumiveisMes();
    } catch (err) {
        console.error('Erro ao carregar consumíveis mensais:', err.message);
    }
}

function filtrarERenderizarConsumiveisMes() {
    const inputMes = document.getElementById('filtro-financas-mes');
    if (!inputMes || !inputMes.value) return [];

    const [anoSel, mesSel] = inputMes.value.split('-');

    const consumiveisMes = listaConsumiveisGlobal.filter(item => {
        const dataRef = item.data_compra || item.created_at;
        const dataInfo = extrairAnoMes(dataRef);
        return dataInfo && dataInfo.ano === String(anoSel) && dataInfo.mes === String(mesSel).padStart(2, '0');
    });

    renderizarTabelaConsumiveis(consumiveisMes);
    return consumiveisMes;
}

function renderizarTabelaConsumiveis(itens) {
    const tbody = document.getElementById('tabela-consumiveis-body');
    const resumoAcc = document.getElementById('resumo-consumiveis-insumos');
    if (!tbody) return;

    const total = itens.reduce((acc, cur) => acc + (Number(cur.valor) || 0), 0);
    if (resumoAcc) {
        resumoAcc.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    if (itens.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="py-3 text-center text-slate-500 italic text-[11px]">• Nenhum consumível neste mês.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = itens.map(item => {
        const dataStr = item.data_compra ? item.data_compra.split('-').reverse().slice(0, 2).join('/') : '-';
        return `
            <tr class="hover:bg-slate-800/40 border-b border-slate-800/50">
                <td class="py-2 px-1 font-semibold text-slate-200 truncate max-w-[100px]" title="${item.nome}">${item.nome || '-'}</td>
                <td class="py-2 px-1 font-mono text-teal-300">R$ ${Number(item.valor || 0).toFixed(2)}</td>
                <td class="py-2 px-1 font-mono text-slate-400 text-center">${dataStr}</td>
                <td class="py-2 px-1 text-right space-x-1 whitespace-nowrap">
                    <button onclick="abrirModalEditarConsumivel(${item.id})" class="p-1 text-slate-400 hover:text-teal-400 transition" title="Editar">✏️</button>
                    <button onclick="excluirConsumivel(${item.id})" class="p-1 text-slate-400 hover:text-red-400 transition" title="Excluir">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function abrirModalConsumivel() {
    const modal = document.getElementById('modal-consumivel');
    const form = document.getElementById('form-consumivel');
    if (form) form.reset();

    const inputData = document.getElementById('input-consumivel-data');
    if (inputData) {
        const inputMes = document.getElementById('filtro-financas-mes');
        if (inputMes && inputMes.value) {
            inputData.value = `${inputMes.value}-01`;
        } else {
            inputData.value = new Date().toISOString().split('T')[0];
        }
    }

    if (modal) modal.classList.remove('hidden');
}

function fecharModalConsumivel() {
    const modal = document.getElementById('modal-consumivel');
    if (modal) modal.classList.add('hidden');
}

async function salvarNovoConsumivel(e) {
    if (e) e.preventDefault();

    const nome = document.getElementById('input-consumivel-nome')?.value?.trim();
    const valor = parseFloat(document.getElementById('input-consumivel-valor')?.value) || 0;
    const dataCompra = document.getElementById('input-consumivel-data')?.value || new Date().toISOString().split('T')[0];

    if (!nome || valor <= 0) {
        alert('Por favor, informe a descrição e um valor válido.');
        return;
    }

    try {
        const client = obterSupabaseClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client
            .from('consumiveis_mensais')
            .insert([{ nome, valor, data_compra: dataCompra }]);

        if (error) throw error;

        fecharModalConsumivel();
        await carregarConsumiveis();
        await carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao salvar consumível: ' + err.message);
    }
}

function abrirModalEditarConsumivel(id) {
    const item = listaConsumiveisGlobal.find(c => c.id === id);
    if (!item) return;

    if (document.getElementById('input-editar-consumivel-id')) document.getElementById('input-editar-consumivel-id').value = item.id;
    if (document.getElementById('input-editar-consumivel-nome')) document.getElementById('input-editar-consumivel-nome').value = item.nome || '';
    if (document.getElementById('input-editar-consumivel-valor')) document.getElementById('input-editar-consumivel-valor').value = item.valor || 0;
    if (document.getElementById('input-editar-consumivel-data')) document.getElementById('input-editar-consumivel-data').value = item.data_compra || '';

    const modal = document.getElementById('modal-editar-consumivel');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalEditarConsumivel() {
    const modal = document.getElementById('modal-editar-consumivel');
    if (modal) modal.classList.add('hidden');
}

async function salvarEdicaoConsumivel(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('input-editar-consumivel-id')?.value;
    const nome = document.getElementById('input-editar-consumivel-nome')?.value?.trim();
    const valor = parseFloat(document.getElementById('input-editar-consumivel-valor')?.value) || 0;
    const dataCompra = document.getElementById('input-editar-consumivel-data')?.value;

    if (!id || !nome || valor <= 0 || !dataCompra) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    try {
        const client = obterSupabaseClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client
            .from('consumiveis_mensais')
            .update({ nome, valor, data_compra: dataCompra })
            .eq('id', id);

        if (error) throw error;

        fecharModalEditarConsumivel();
        await carregarConsumiveis();
        await carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao atualizar consumível: ' + err.message);
    }
}

async function excluirConsumivel(id) {
    if (!confirm('Deseja realmente excluir este item de consumível?')) return;

    try {
        const client = obterSupabaseClient();
        if (!client) throw new Error('Cliente Supabase não inicializado.');

        const { error } = await client.from('consumiveis_mensais').delete().eq('id', id);
        if (error) throw error;

        await carregarConsumiveis();
        await carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao excluir consumível: ' + err.message);
    }
}

// ==========================================
// CÁLCULOS DRE, CARDS E GRÁFICOS
// ==========================================
async function carregarDadosFinanceiros() {
    carregarTaxasSalvas();
    const inputMes = document.getElementById('filtro-financas-mes');
    if (!inputMes) return;

    if (!inputMes.value) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        inputMes.value = `${ano}-${mes}`;
    }

    const [anoSel, mesSel] = inputMes.value.split('-');

    try {
        const client = obterSupabaseClient();
        if (!client) return;

        // Busca simultânea de Pedidos, Filamentos e Consumíveis
        const [
            { data: pedidos, error: errPedidos },
            { data: filamentos, error: errFilamentos },
            { data: consumiveis, error: errConsumiveis }
        ] = await Promise.all([
            client.from('pedidos').select('*'),
            client.from('filamentos').select('*'),
            client.from('consumiveis_mensais').select('*')
        ]);

        if (errPedidos) throw errPedidos;
        if (errFilamentos) console.warn('Aviso estoque filamentos:', errFilamentos.message);
        if (errConsumiveis) console.warn('Aviso consumíveis mensais:', errConsumiveis.message);

        const todosPedidos = pedidos || [];
        const listaFilamentos = filamentos || [];
        listaConsumiveisGlobal = consumiveis || [];

        // Filtra consumíveis do mês selecionado
        const consumiveisMes = listaConsumiveisGlobal.filter(item => {
            const dataRef = item.data_compra || item.created_at;
            const dataInfo = extrairAnoMes(dataRef);
            return dataInfo && dataInfo.ano === String(anoSel) && dataInfo.mes === String(mesSel).padStart(2, '0');
        });

        renderizarTabelaConsumiveis(consumiveisMes);
        const totalConsumiveisMes = consumiveisMes.reduce((acc, cur) => acc + (Number(cur.valor) || 0), 0);

        // Mapear custo por grama de cada carretel
        const mapaCustoFilamentoPorId = {};
        const mapaCustoFilamentoPorNome = {};

        let totalInvestimentoEstoqueMes = 0;
        let qtdCarreteisCompradosMes = 0;
        const listaCarreteisCompradosMes = [];

        listaFilamentos.forEach(f => {
            if (!f) return;
            const preco = Number(f.preco_custo || f.preco || 0) || 0;
            const pesoTotal = Number(f.peso_total_g || f.peso_total || f.peso_inicial_g || 1000) || 1000;
            const custoPorGrama = (preco > 0 && pesoTotal > 0) ? (preco / pesoTotal) : 0.09;

            if (f.id) mapaCustoFilamentoPorId[f.id] = custoPorGrama;
            
            const chaveNome = `${f.material || ''} ${f.cor || ''}`.trim() || f.marca || 'PLA Padrão';
            mapaCustoFilamentoPorNome[chaveNome] = custoPorGrama;

            const dataCriacao = f.created_at || f.data_compra;
            if (dataCriacao) {
                const dataInfo = extrairAnoMes(dataCriacao);
                if (dataInfo && dataInfo.ano === String(anoSel) && dataInfo.mes === String(mesSel).padStart(2, '0')) {
                    totalInvestimentoEstoqueMes += preco;
                    qtdCarreteisCompradosMes += 1;
                    listaCarreteisCompradosMes.push({
                        nome: `${f.marca || ''} ${f.material || ''} ${f.cor || ''}`.trim() || 'Carretel de Filamento',
                        preco: preco
                    });
                }
            }
        });

        // Filtragem de pedidos
        const pedidosFiltrados = todosPedidos.filter(p => {
            if (!p) return false;
            let dataRef = null;

            if (visaoFinanceiraAtual === 'competencia') {
                dataRef = p.data_pedido || p.created_at;
            } else {
                if (p.status_pagamento !== 'Pago' && p.status !== 'Pagamento Recebido') return false;
                dataRef = p.data_pagamento || p.data_pedido || p.created_at;
            }

            if (!dataRef) return false;
            const dataInfo = extrairAnoMes(dataRef);
            return dataInfo && dataInfo.ano === String(anoSel) && dataInfo.mes === String(mesSel).padStart(2, '0');
        });

        // Agrupamentos e somas
        let faturamentoBruto = 0;
        let valorLiberado = 0;
        let totalCustoInsumo = 0;
        let estimativaTaxasPlataformas = 0;

        const contagemProdutos = {};
        const contagemCanais = { 'Shopee': 0, 'Mercado Livre': 0, 'Site': 0, 'WhatsApp': 0 };
        const taxasPorCanalMap = { 'Shopee': 0, 'Mercado Livre': 0, 'Site': 0, 'WhatsApp': 0 };
        const consumoFilamentos = {};

        pedidosFiltrados.forEach(p => {
            if (!p) return;
            const qtd = parseInt(p.quantidade_unidades || p.quantidade || p.unidades || 1, 10) || 1;
            const valUnit = Number(p.valor_total || 0) || 0;
            const totalPedido = valUnit * qtd;

            faturamentoBruto += totalPedido;

            if (p.status_pagamento === 'Pago' || p.status === 'Pagamento Recebido') {
                valorLiberado += totalPedido;
            }

            let canal = p.origem || 'WhatsApp';
            if (canal === 'Site Próprio') canal = 'Site';
            
            if (contagemCanais[canal] !== undefined) {
                contagemCanais[canal] += totalPedido;
            } else {
                contagemCanais[canal] = totalPedido;
            }

            const pctTaxa = (taxasCanaisConfig && taxasCanaisConfig[canal] !== undefined) ? taxasCanaisConfig[canal] : 15;
            const valorTaxaPedido = (totalPedido * (pctTaxa / 100));
            estimativaTaxasPlataformas += valorTaxaPedido;

            if (taxasPorCanalMap[canal] !== undefined) {
                taxasPorCanalMap[canal] += valorTaxaPedido;
            } else {
                taxasPorCanalMap[canal] = valorTaxaPedido;
            }

            // Insumos e CPV
            const pesoPedidoTotal = Number(p.peso_consumido_g || p.peso_g || 0) || 0;
            const rawInsumo = p.insumo || (p.filamento_id ? `Carretel #${p.filamento_id}` : 'PLA Padrão');
            
            const listaInsumosSeparados = typeof rawInsumo === 'string'
                ? rawInsumo.split(',').map(i => i.trim()).filter(Boolean)
                : [];
            const qtdInsumos = listaInsumosSeparados.length > 0 ? listaInsumosSeparados.length : 1;
            const pesoPorInsumo = pesoPedidoTotal / qtdInsumos;

            if (listaInsumosSeparados.length === 0) {
                const insumoNome = 'PLA Padrão';
                let custoPorG = (p.filamento_id && mapaCustoFilamentoPorId[p.filamento_id])
                    ? mapaCustoFilamentoPorId[p.filamento_id]
                    : 0.09;

                const custoItemInsumo = pesoPedidoTotal * custoPorG;
                totalCustoInsumo += custoItemInsumo;

                if (!consumoFilamentos[insumoNome]) {
                    consumoFilamentos[insumoNome] = { peso: 0, custoTotal: 0, custoPorGrama: custoPorG };
                }
                consumoFilamentos[insumoNome].peso += pesoPedidoTotal;
                consumoFilamentos[insumoNome].custoTotal += custoItemInsumo;
            } else {
                listaInsumosSeparados.forEach(insumoNome => {
                    let custoPorG = 0.09;

                    if (p.filamento_id && mapaCustoFilamentoPorId[p.filamento_id]) {
                        custoPorG = mapaCustoFilamentoPorId[p.filamento_id];
                    } else if (mapaCustoFilamentoPorNome[insumoNome]) {
                        custoPorG = mapaCustoFilamentoPorNome[insumoNome];
                    }

                    const custoItemInsumo = pesoPorInsumo * custoPorG;
                    totalCustoInsumo += custoItemInsumo;

                    if (!consumoFilamentos[insumoNome]) {
                        consumoFilamentos[insumoNome] = { peso: 0, custoTotal: 0, custoPorGrama: custoPorG };
                    }
                    consumoFilamentos[insumoNome].peso += pesoPorInsumo;
                    consumoFilamentos[insumoNome].custoTotal += custoItemInsumo;
                });
            }

            const nomeProd = (p.produto && String(p.produto).trim()) ? String(p.produto).trim() : 'Produto Indefinido';
            if (!contagemProdutos[nomeProd]) contagemProdutos[nomeProd] = { qtd: 0, faturamento: 0 };
            contagemProdutos[nomeProd].qtd += qtd;
            contagemProdutos[nomeProd].faturamento += totalPedido;
        });

        const totalCustosFixos = (listaCustosFixosGlobal || []).reduce((acc, c) => acc + (Number(c?.valor || 0) || 0), 0);
        
        // LUCRO LÍQUIDO REAL DEDUZINDO TAMBÉM OS CONSUMÍVEIS EXTRAS DO MÊS
        const lucroLiquido = faturamentoBruto - estimativaTaxasPlataformas - totalCustoInsumo - totalConsumiveisMes - totalCustosFixos;
        const margemLiquida = faturamentoBruto > 0 ? ((lucroLiquido / faturamentoBruto) * 100) : 0;

        // Atualização dos Cards Top
        const elFat = document.getElementById('card-faturamento');
        if (elFat) elFat.textContent = faturamentoBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const elLib = document.getElementById('card-liberado');
        if (elLib) elLib.textContent = valorLiberado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const elInvEstoque = document.getElementById('card-investimento-estoque');
        if (elInvEstoque) elInvEstoque.textContent = totalInvestimentoEstoqueMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const elSubInvEstoque = document.getElementById('sub-investimento-estoque');
        if (elSubInvEstoque) elSubInvEstoque.textContent = `${qtdCarreteisCompradosMes} carretel(éis) no mês`;

        const resInvAcc = document.getElementById('resumo-investimento-estoque');
        if (resInvAcc) resInvAcc.textContent = totalInvestimentoEstoqueMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const resCustosAcc = document.getElementById('resumo-custos-fixos');
        if (resCustosAcc) resCustosAcc.textContent = totalCustosFixos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const elLucro = document.getElementById('card-lucro');
        if (elLucro) {
            elLucro.textContent = lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            elLucro.className = `text-lg md:text-xl font-black ${lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
        }

        const elMargem = document.getElementById('card-margem');
        if (elMargem) elMargem.textContent = `${margemLiquida.toFixed(1)}%`;

        // Renderização DRE
        renderizarDRE({
            faturamentoBruto,
            estimativaTaxasPlataformas,
            taxasPorCanalMap,
            totalCustoInsumo,
            totalConsumiveisMes,
            consumiveisLista: consumiveisMes,
            totalCustosFixos,
            totalInvestimentoEstoqueMes,
            listaCarreteisCompradosMes,
            lucroLiquido,
            margemLiquida,
            contagemCanais,
            consumoFilamentos,
            custosFixosLista: listaCustosFixosGlobal
        });

        renderizarRankings(contagemProdutos, consumoFilamentos);
        renderizarGraficos(todosPedidos, contagemCanais, anoSel);

    } catch (err) {
        console.error('Erro ao carregar dados financeiros:', err.message);
    }
}

function renderizarDRE(dados) {
    const elBruta = document.getElementById('dre-receita-bruta');
    const elTaxas = document.getElementById('dre-taxas');
    const elInsumos = document.getElementById('dre-custo-insumos');
    const elConsumiveis = document.getElementById('dre-consumiveis-extras');
    const elFixos = document.getElementById('dre-custos-fixos');
    const elLucro = document.getElementById('dre-lucro-liquido');
    const elMargem = document.getElementById('dre-margem-porcentagem');

    if (elBruta) elBruta.textContent = dados.faturamentoBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (elTaxas) elTaxas.textContent = `- ${dados.estimativaTaxasPlataformas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    if (elInsumos) elInsumos.textContent = `- ${dados.totalCustoInsumo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    if (elConsumiveis) elConsumiveis.textContent = `- ${(dados.totalConsumiveisMes || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    if (elFixos) elFixos.textContent = `- ${dados.totalCustosFixos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    
    if (elLucro) {
        elLucro.textContent = dados.lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        elLucro.className = `text-sm font-black ${dados.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    }

    if (elMargem) elMargem.textContent = `(${dados.margemLiquida.toFixed(1)}%)`;

    // Detalhe de Receita
    const elDetReceitas = document.getElementById('dre-detalhe-receitas');
    if (elDetReceitas) {
        const canais = Object.entries(dados.contagemCanais || {}).filter(([_, val]) => val > 0);
        if (canais.length === 0) {
            elDetReceitas.innerHTML = `<div class="italic text-slate-500 py-0.5">• Nenhuma receita registrada</div>`;
        } else {
            elDetReceitas.innerHTML = canais.map(([canal, val]) => `
                <div class="flex justify-between items-center py-0.5 border-l-2 border-indigo-500/30 pl-2">
                    <span>• ${canal}</span>
                    <span class="font-mono text-slate-300">${val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
            `).join('');
        }
    }

    // Detalhe de Taxas
    const elDetTaxas = document.getElementById('dre-detalhe-taxas');
    if (elDetTaxas) {
        const taxasCanais = Object.entries(dados.taxasPorCanalMap || {}).filter(([_, val]) => val > 0);
        if (taxasCanais.length === 0) {
            elDetTaxas.innerHTML = `<div class="italic text-slate-500 py-0.5">• Nenhuma taxa cobrada</div>`;
        } else {
            elDetTaxas.innerHTML = taxasCanais.map(([canal, val]) => {
                const pct = taxasCanaisConfig[canal] !== undefined ? taxasCanaisConfig[canal] : 0;
                return `
                    <div class="flex justify-between items-center py-0.5 border-l-2 border-red-500/30 pl-2">
                        <span>• ${canal} (${pct}%)</span>
                        <span class="font-mono text-red-300">- ${val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // Detalhe de Insumos (CPV)
    const elDetInsumos = document.getElementById('dre-detalhe-insumos');
    if (elDetInsumos) {
        const insumos = Object.entries(dados.consumoFilamentos || {}).filter(([_, item]) => item.peso > 0);
        if (insumos.length === 0) {
            elDetInsumos.innerHTML = `<div class="italic text-slate-500 py-0.5">• Nenhum consumo de insumo</div>`;
        } else {
            elDetInsumos.innerHTML = insumos.map(([nome, item]) => `
                <div class="flex justify-between items-center py-0.5 border-l-2 border-red-500/30 pl-2">
                    <span>• ${nome} (${item.peso.toFixed(0)}g)</span>
                    <span class="font-mono text-red-300">- ${item.custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
            `).join('');
        }
    }

    // Detalhe de Consumíveis e Insumos Extras (DRE)
    const elDetConsumiveis = document.getElementById('dre-detalhe-consumiveis');
    if (elDetConsumiveis) {
        const itensCons = dados.consumiveisLista || [];
        if (itensCons.length === 0) {
            elDetConsumiveis.innerHTML = `<div class="italic text-slate-500 py-0.5">• Nenhum consumível ou insumo extra neste mês</div>`;
        } else {
            elDetConsumiveis.innerHTML = itensCons.map(c => `
                <div class="flex justify-between items-center py-0.5 border-l-2 border-teal-500/30 pl-2">
                    <span>• ${c.nome}</span>
                    <span class="font-mono text-red-300">- ${Number(c.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
            `).join('');
        }
    }

    // Detalhe de Custos Fixos
    const elDetFixos = document.getElementById('dre-detalhe-custos-fixos');
    if (elDetFixos) {
        const fixos = dados.custosFixosLista || [];
        if (fixos.length === 0) {
            elDetFixos.innerHTML = `<div class="italic text-slate-500 py-0.5">• Nenhum custo fixo cadastrado</div>`;
        } else {
            elDetFixos.innerHTML = fixos.map(c => `
                <div class="flex justify-between items-center py-0.5 border-l-2 border-amber-500/30 pl-2">
                    <span>• ${c.nome} (Venc: Dia ${c.dia_vencimento || '-'})</span>
                    <span class="font-mono text-red-300">- ${Number(c.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
            `).join('');
        }
    }

    // Detalhe de Carretéis Comprados no Accordion Lateral
    const elListaCarreteisAcc = document.getElementById('lista-detalhe-carreteis-mes');
    if (elListaCarreteisAcc) {
        const carreteis = dados.listaCarreteisCompradosMes || [];
        if (carreteis.length === 0) {
            elListaCarreteisAcc.innerHTML = `<p class="text-slate-500 italic text-[11px] text-center py-2">• Nenhum carretel cadastrado neste mês.</p>`;
        } else {
            elListaCarreteisAcc.innerHTML = carreteis.map(c => `
                <div class="flex justify-between items-center py-1 border-b border-slate-800/60 text-xs">
                    <span class="font-bold text-slate-200">• ${c.nome}</span>
                    <span class="font-mono font-bold text-purple-300">${c.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
            `).join('');
        }
    }
}

function renderizarRankings(contagemProdutos, consumoFilamentos) {
    const elTop = document.getElementById('ranking-top-produtos');
    const elFilamentos = document.getElementById('ranking-filamentos-consumo');

    const listaProds = Object.entries(contagemProdutos || {}).map(([nome, d]) => ({ nome, ...d }));
    listaProds.sort((a, b) => b.qtd - a.qtd);

    if (elTop) {
        if (listaProds.length === 0) {
            elTop.innerHTML = `<p class="text-slate-500 italic text-center py-4">Nenhuma venda registrada no período.</p>`;
        } else {
            elTop.innerHTML = listaProds.slice(0, 5).map((p, i) => `
                <div class="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
                    <div class="flex items-center gap-2.5 truncate">
                        <span class="w-5 h-5 rounded-full ${i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-400'} flex items-center justify-center font-bold text-[10px] shrink-0">${i + 1}</span>
                        <span class="font-bold text-slate-200 truncate">${p.nome}</span>
                    </div>
                    <div class="text-right shrink-0">
                        <span class="font-mono font-bold text-indigo-400">${p.qtd} un</span>
                        <span class="text-[10px] text-slate-500 block font-mono">${p.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                </div>
            `).join('');
        }
    }

    const listaFil = Object.entries(consumoFilamentos || {}).map(([nome, item]) => ({ nome, peso: item.peso }));
    listaFil.sort((a, b) => b.peso - a.peso);

    if (elFilamentos) {
        if (listaFil.length === 0) {
            elFilamentos.innerHTML = `<p class="text-slate-500 italic text-center py-4">Nenhum consumo registrado.</p>`;
        } else {
            elFilamentos.innerHTML = listaFil.slice(0, 5).map(f => `
                <div class="flex items-center justify-between p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
                    <span class="font-bold text-slate-300 truncate">🧵 ${f.nome}</span>
                    <span class="font-mono font-bold text-emerald-400">${f.peso.toFixed(0)}g</span>
                </div>
            `).join('');
        }
    }
}

function renderizarGraficos(todosPedidos, contagemCanais, anoSel) {
    if (typeof Chart === 'undefined') return;

    const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const faturamentoPorMes = new Array(12).fill(0);

    (todosPedidos || []).forEach(p => {
        if (!p) return;
        const dataRef = p.data_pedido || p.created_at;
        const dataInfo = extrairAnoMes(dataRef);
        if (dataInfo && dataInfo.ano === String(anoSel)) {
            const m = parseInt(dataInfo.mes, 10) - 1;
            if (m >= 0 && m < 12) {
                const qtd = parseInt(p.quantidade_unidades || p.quantidade || p.unidades || 1, 10) || 1;
                faturamentoPorMes[m] += (Number(p.valor_total || 0) * qtd);
            }
        }
    });

    const canvasEvolucao = document.getElementById('chart-evolucao-mensal');
    if (canvasEvolucao) {
        const ctxEvolucao = canvasEvolucao.getContext('2d');
        if (ctxEvolucao) {
            if (chartEvolucaoInstance) chartEvolucaoInstance.destroy();

            chartEvolucaoInstance = new Chart(ctxEvolucao, {
                type: 'bar',
                data: {
                    labels: mesesNomes,
                    datasets: [{
                        label: `Faturamento ${anoSel} (R$)`,
                        data: faturamentoPorMes,
                        backgroundColor: '#6366f1',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } }
                    }
                }
            });
        }
    }

    const canvasCanais = document.getElementById('chart-distribuicao-canais');
    if (canvasCanais) {
        const ctxCanais = canvasCanais.getContext('2d');
        if (ctxCanais) {
            if (chartCanaisInstance) chartCanaisInstance.destroy();

            chartCanaisInstance = new Chart(ctxCanais, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(contagemCanais || {}),
                    datasets: [{
                        data: Object.values(contagemCanais || {}),
                        backgroundColor: ['#EE4D2D', '#FFE600', '#2563EB', '#25D366'],
                        borderWidth: 2,
                        borderColor: '#0f172a'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 12 }
                        }
                    }
                }
            });
        }
    }
}

// Exportações explícitas no escopo global
if (typeof window !== 'undefined') {
    window.toggleAccordion = toggleAccordion;
    window.inicializarModuloFinancas = inicializarModuloFinancas;
    window.carregarDadosFinanceiros = carregarDadosFinanceiros;
    window.alternarVisaoFinanceira = alternarVisaoFinanceira;
    window.abrirModalConfigurarTaxas = abrirModalConfigurarTaxas;
    window.fecharModalConfigurarTaxas = fecharModalConfigurarTaxas;
    window.salvarConfiguracaoTaxas = salvarConfiguracaoTaxas;

    // Custos Fixos
    window.abrirModalCustoFixo = abrirModalCustoFixo;
    window.fecharModalCustoFixo = fecharModalCustoFixo;
    window.salvarNovoCustoFixo = salvarNovoCustoFixo;
    window.abrirModalEditarCustoFixo = abrirModalEditarCustoFixo;
    window.fecharModalEditarCustoFixo = fecharModalEditarCustoFixo;
    window.salvarEdicaoCustoFixo = salvarEdicaoCustoFixo;
    window.excluirCustoFixo = excluirCustoFixo;

    // Consumíveis e Insumos
    window.carregarConsumiveis = carregarConsumiveis;
    window.abrirModalConsumivel = abrirModalConsumivel;
    window.fecharModalConsumivel = fecharModalConsumivel;
    window.salvarNovoConsumivel = salvarNovoConsumivel;
    window.abrirModalEditarConsumivel = abrirModalEditarConsumivel;
    window.fecharModalEditarConsumivel = fecharModalEditarConsumivel;
    window.salvarEdicaoConsumivel = salvarEdicaoConsumivel;
    window.excluirConsumivel = excluirConsumivel;
}