// assets/js/modules/manutencao.js
//
// Base de conhecimento das impressoras:
// - impressoras: cadastro (apelido, modelo, observações, em uso).
// - manutencoes: histórico (data, tipo, o que foi feito, problema e solução).
// - Gastos de manutenção ficam em "despesas" (categoria "Manutenção & Peças"), ligados à impressora
//   e, quando lançados junto com a manutenção, ao próprio registro. Assim entram direto no Financeiro.

let listaImpressorasGlobal = [];
let listaManutencoesGlobal = [];
let listaGastosManutencaoGlobal = [];
let filtroImpressoraManutencao = null;

const CATEGORIA_MANUTENCAO = 'Manutenção & Peças';
const somaValores = (lista) => lista.reduce((acc, g) => acc + Number(g.valor || 0), 0);

const TIPOS_MANUTENCAO = [
    'Lubrificação', 'Limpeza de bico', 'Troca de bico', 'Troca de peça', 'Calibração / Nivelamento',
    'Ajuste de correia', 'Atualização de firmware', 'Problema / Reparo', 'Upgrade', 'Outro'
];
const ICONES_TIPO_MANUTENCAO = {
    'Lubrificação': '🛢️', 'Limpeza de bico': '🧽', 'Troca de bico': '🔩', 'Troca de peça': '⚙️',
    'Calibração / Nivelamento': '📐', 'Ajuste de correia': '🔗', 'Atualização de firmware': '💾',
    'Problema / Reparo': '🚨', 'Upgrade': '🚀', 'Outro': '📝'
};

const dataBR = (valor) => {
    const p = typeof valor === 'string' && valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return p ? `${p[3]}/${p[2]}/${p[1]}` : '-';
};
const textoSeguro = (t) => (typeof escaparHtml === 'function' ? escaparHtml(t) : String(t ?? ''));
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function hojeLocalISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function carregarImpressoras() {
    try {
        const { data, error } = await _supabase.from('impressoras').select('*').order('nome', { ascending: true });
        if (error) throw error;
        listaImpressorasGlobal = data || [];
    } catch (err) {
        console.error('Erro ao carregar impressoras:', err.message || err);
    }
    return listaImpressorasGlobal;
}

async function carregarDadosManutencao() {
    try {
        const [, { data: manutencoes, error: errMan }, { data: gastos, error: errGastos }] = await Promise.all([
            carregarImpressoras(),
            _supabase.from('manutencoes').select('*').order('data', { ascending: false }).order('id', { ascending: false }),
            // Só peças e insumos de manutenção; investimentos (impressoras, upgrades) ficam em Despesas & Investimentos
            _supabase.from('despesas').select('*').eq('categoria', CATEGORIA_MANUTENCAO).order('data', { ascending: false })
        ]);
        if (errMan) throw errMan;
        if (errGastos) throw errGastos;

        listaManutencoesGlobal = manutencoes || [];
        listaGastosManutencaoGlobal = gastos || [];

        renderizarCardsImpressoras();
        renderizarHistoricoManutencoes();
        renderizarGastosManutencao();
    } catch (err) {
        console.error('Erro ao carregar dados de manutenção:', err.message || err);
    }
}

async function inicializarModuloManutencao() {
    const selTipo = document.getElementById('filtro-manutencao-tipo');
    if (selTipo && selTipo.options.length <= 1) {
        selTipo.innerHTML = `<option value="">Todos os tipos</option>` + TIPOS_MANUTENCAO.map(t => `<option value="${t}">${t}</option>`).join('');
    }
    await carregarDadosManutencao();
}

// ==========================================
// CARDS DAS IMPRESSORAS
// ==========================================
function renderizarCardsImpressoras() {
    const el = document.getElementById('lista-impressoras');
    if (!el) return;

    if (listaImpressorasGlobal.length === 0) {
        el.innerHTML = `
            <div class="sm:col-span-2 lg:col-span-4 bg-slate-900/60 border border-dashed border-slate-700 rounded-2xl p-6 text-center space-y-2">
                <div class="text-3xl">🖨️</div>
                <p class="text-xs text-slate-400">Cadastre suas impressoras para começar o histórico de manutenção.</p>
                <button onclick="abrirModalImpressora()" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition">🖨️ + Cadastrar primeira impressora</button>
            </div>`;
        return;
    }

    el.innerHTML = listaImpressorasGlobal.map(imp => {
        const registros = listaManutencoesGlobal.filter(m => m.impressora_id === imp.id);
        const ultima = registros[0];
        const gasto = somaValores(listaGastosManutencaoGlobal.filter(g => g.impressora_id === imp.id));
        const diasDesde = ultima ? Math.floor((new Date(hojeLocalISO()) - new Date(ultima.data)) / 86400000) : null;
        const selecionada = filtroImpressoraManutencao === imp.id;

        return `
            <div onclick="filtrarManutencaoPorImpressora(${imp.id})" class="cursor-pointer bg-slate-900/60 p-3.5 rounded-2xl border transition space-y-2 ${selecionada ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-800 hover:border-slate-700'} ${imp.ativa ? '' : 'opacity-60'}">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="font-bold text-white text-sm truncate">🖨️ ${textoSeguro(imp.nome)}</div>
                        <div class="text-[10px] text-slate-500 truncate">${textoSeguro(imp.modelo || 'Modelo não informado')}${imp.ativa ? '' : ' · fora de uso'}</div>
                    </div>
                    <button onclick="event.stopPropagation(); abrirModalImpressora(${imp.id})" class="p-1 text-slate-500 hover:text-indigo-400 transition text-xs" title="Editar impressora">✏️</button>
                </div>
                <div class="grid grid-cols-3 gap-1.5 text-center">
                    <div class="bg-slate-950/60 rounded-lg p-1.5">
                        <span class="block text-[9px] text-slate-500 uppercase font-bold">Registros</span>
                        <span class="font-mono font-bold text-slate-200 text-xs">${registros.length}</span>
                    </div>
                    <div class="bg-slate-950/60 rounded-lg p-1.5">
                        <span class="block text-[9px] text-slate-500 uppercase font-bold">Última</span>
                        <span class="font-mono font-bold text-xs ${diasDesde === null ? 'text-slate-500' : (diasDesde > 30 ? 'text-amber-300' : 'text-emerald-300')}">${diasDesde === null ? '—' : (diasDesde === 0 ? 'hoje' : `${diasDesde}d`)}</span>
                    </div>
                    <div class="bg-slate-950/60 rounded-lg p-1.5" title="Peças e insumos de manutenção (gasto)">
                        <span class="block text-[9px] text-slate-500 uppercase font-bold">Manutenção</span>
                        <span class="font-mono font-bold text-amber-300 text-xs">${moeda(gasto)}</span>
                    </div>
                </div>
                ${ultima ? `<div class="text-[10px] text-slate-400 truncate">${ICONES_TIPO_MANUTENCAO[ultima.tipo] || '📝'} ${textoSeguro(ultima.tipo)} em ${dataBR(ultima.data)}</div>` : '<div class="text-[10px] text-slate-500 italic">Nenhuma manutenção registrada</div>'}
            </div>`;
    }).join('');
}

function filtrarManutencaoPorImpressora(id) {
    filtroImpressoraManutencao = filtroImpressoraManutencao === id ? null : id;
    renderizarCardsImpressoras();
    renderizarHistoricoManutencoes();
    renderizarGastosManutencao();
}

// ==========================================
// HISTÓRICO (LINHA DO TEMPO)
// ==========================================
function renderizarHistoricoManutencoes() {
    const el = document.getElementById('lista-manutencoes');
    if (!el) return;

    const impressoraFiltro = listaImpressorasGlobal.find(i => i.id === filtroImpressoraManutencao);
    const label = document.getElementById('filtro-impressora-label');
    if (label) {
        label.innerHTML = impressoraFiltro
            ? `· ${textoSeguro(impressoraFiltro.nome)} <button onclick="filtrarManutencaoPorImpressora(${impressoraFiltro.id})" class="ml-1 text-slate-400 hover:text-white">✕</button>`
            : '';
    }

    const tipo = document.getElementById('filtro-manutencao-tipo')?.value || '';
    const busca = (document.getElementById('filtro-manutencao-busca')?.value || '').trim().toLowerCase();

    const registros = listaManutencoesGlobal.filter(m =>
        (!filtroImpressoraManutencao || m.impressora_id === filtroImpressoraManutencao) &&
        (!tipo || m.tipo === tipo) &&
        (!busca || `${m.descricao} ${m.problema || ''} ${m.solucao || ''} ${m.tipo}`.toLowerCase().includes(busca))
    );

    if (registros.length === 0) {
        el.innerHTML = `<p class="text-slate-500 italic text-xs text-center py-6">${listaManutencoesGlobal.length === 0 ? 'Nenhuma manutenção registrada ainda. Use "+ Registrar Manutenção".' : 'Nenhum registro encontrado com esses filtros.'}</p>`;
        return;
    }

    el.innerHTML = registros.map(m => {
        const impressora = listaImpressorasGlobal.find(i => i.id === m.impressora_id);
        const gastos = listaGastosManutencaoGlobal.filter(g => g.manutencao_id === m.id);
        const totalGastos = gastos.reduce((acc, g) => acc + Number(g.valor || 0), 0);
        const ehProblema = m.tipo === 'Problema / Reparo' || !!m.problema;

        return `
            <div class="bg-slate-950/50 border ${ehProblema ? 'border-red-900/50' : 'border-slate-800'} rounded-xl p-3 space-y-1.5">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-[10px] font-mono text-slate-500">${dataBR(m.data)}</span>
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${ehProblema ? 'bg-red-950/60 border-red-800/60 text-red-300' : 'bg-indigo-950/60 border-indigo-800/60 text-indigo-300'}">${ICONES_TIPO_MANUTENCAO[m.tipo] || '📝'} ${textoSeguro(m.tipo)}</span>
                            <span class="text-[10px] text-slate-400">🖨️ ${textoSeguro(impressora ? impressora.nome : 'Impressora removida')}</span>
                        </div>
                        <div class="text-xs font-semibold text-slate-100 mt-1">${textoSeguro(m.descricao)}</div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        ${totalGastos > 0 ? `<span class="text-[10px] font-mono font-bold text-amber-300 mr-1">${moeda(totalGastos)}</span>` : ''}
                        <button onclick="abrirModalManutencao(${m.id})" class="p-1 text-slate-400 hover:text-indigo-400 transition text-xs" title="Editar">✏️</button>
                        <button onclick="excluirManutencao(${m.id})" class="p-1 text-slate-400 hover:text-red-400 transition text-xs" title="Excluir">🗑️</button>
                    </div>
                </div>
                ${m.problema ? `<div class="text-[11px] text-red-200/90 bg-red-950/20 border-l-2 border-red-700/60 pl-2 py-0.5"><strong class="text-red-300">Problema:</strong> ${textoSeguro(m.problema)}</div>` : ''}
                ${m.solucao ? `<div class="text-[11px] text-emerald-200/90 bg-emerald-950/20 border-l-2 border-emerald-700/60 pl-2 py-0.5"><strong class="text-emerald-300">Solução:</strong> ${textoSeguro(m.solucao)}</div>` : ''}
                ${gastos.length > 0 ? `<div class="text-[10px] text-amber-200/80">🛒 ${gastos.map(g => `${textoSeguro(g.descricao)} (${moeda(g.valor)})`).join(' · ')}</div>` : ''}
            </div>`;
    }).join('');
}

// ==========================================
// GASTOS COM MANUTENÇÃO
// ==========================================
// Peças e insumos de manutenção (o filtro de impressora selecionado vale aqui também)
function renderizarGastosManutencao() {
    const el = document.getElementById('lista-gastos-manutencao');
    const elTotal = document.getElementById('total-gastos-manutencao');
    const gastos = listaGastosManutencaoGlobal.filter(g => !filtroImpressoraManutencao || g.impressora_id === filtroImpressoraManutencao);
    if (elTotal) elTotal.textContent = moeda(somaValores(gastos));
    if (!el) return;

    if (gastos.length === 0) {
        el.innerHTML = `<p class="text-slate-500 italic text-[11px] text-center py-3">Nenhum gasto de manutenção registrado.</p>`;
        return;
    }

    el.innerHTML = gastos.map(g => {
        const impressora = listaImpressorasGlobal.find(i => i.id === g.impressora_id);
        return `
            <div class="flex items-center justify-between gap-2 py-1.5 border-b border-slate-800/60">
                <div class="min-w-0">
                    <div class="font-semibold text-slate-200 truncate">${textoSeguro(g.descricao)}</div>
                    <div class="text-[10px] text-slate-500 font-mono">${dataBR(g.data)} · ${textoSeguro(impressora ? impressora.nome : 'Geral')}</div>
                </div>
                <span class="font-mono font-bold text-amber-300 shrink-0">${moeda(g.valor)}</span>
            </div>`;
    }).join('');
}

// ==========================================
// MODAL IMPRESSORA
// ==========================================
function abrirModalImpressora(id = null) {
    const imp = id ? listaImpressorasGlobal.find(i => i.id === id) : null;
    document.getElementById('form-impressora')?.reset();
    document.getElementById('modal-impressora-titulo').textContent = imp ? '✏️ Editar Impressora' : '🖨️ Nova Impressora';
    document.getElementById('input-impressora-id').value = imp ? imp.id : '';
    document.getElementById('input-impressora-nome').value = imp ? imp.nome : '';
    document.getElementById('input-impressora-modelo').value = imp ? (imp.modelo || '') : '';
    document.getElementById('input-impressora-obs').value = imp ? (imp.observacao || '') : '';
    document.getElementById('input-impressora-ativa').checked = imp ? !!imp.ativa : true;
    document.getElementById('modal-impressora')?.classList.remove('hidden');
    document.getElementById('input-impressora-nome')?.focus();
}

function fecharModalImpressora() {
    document.getElementById('modal-impressora')?.classList.add('hidden');
}

async function salvarImpressora(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('input-impressora-id')?.value;
    const nome = document.getElementById('input-impressora-nome')?.value?.trim();
    if (!nome) {
        alert('Informe o apelido da impressora.');
        return;
    }

    const dados = {
        nome,
        modelo: document.getElementById('input-impressora-modelo')?.value?.trim() || null,
        observacao: document.getElementById('input-impressora-obs')?.value?.trim() || null,
        ativa: document.getElementById('input-impressora-ativa')?.checked ?? true
    };

    try {
        const { error } = id
            ? await _supabase.from('impressoras').update(dados).eq('id', id)
            : await _supabase.from('impressoras').insert([dados]);
        if (error) throw error;

        fecharModalImpressora();
        await carregarDadosManutencao();
    } catch (err) {
        alert('Erro ao salvar impressora: ' + err.message);
    }
}

// ==========================================
// MODAL MANUTENÇÃO
// ==========================================
function abrirModalManutencao(id = null) {
    if (listaImpressorasGlobal.length === 0) {
        alert('Cadastre uma impressora primeiro (botão "🖨️ + Impressora").');
        return;
    }

    const m = id ? listaManutencoesGlobal.find(x => x.id === id) : null;
    document.getElementById('form-manutencao')?.reset();
    document.getElementById('modal-manutencao-titulo').textContent = m ? '✏️ Editar Manutenção' : '🔧 Registrar Manutenção';
    document.getElementById('input-manutencao-id').value = m ? m.id : '';

    const impressoraPadrao = m ? m.impressora_id : (filtroImpressoraManutencao || listaImpressorasGlobal.find(i => i.ativa)?.id || listaImpressorasGlobal[0].id);
    document.getElementById('input-manutencao-impressora').innerHTML = listaImpressorasGlobal.map(i =>
        `<option value="${i.id}" ${i.id === impressoraPadrao ? 'selected' : ''}>${textoSeguro(i.nome)}${i.modelo ? ` (${textoSeguro(i.modelo)})` : ''}</option>`).join('');
    document.getElementById('input-manutencao-tipo').innerHTML = TIPOS_MANUTENCAO.map(t =>
        `<option value="${t}" ${m && m.tipo === t ? 'selected' : ''}>${ICONES_TIPO_MANUTENCAO[t]} ${t}</option>`).join('');

    document.getElementById('input-manutencao-data').value = m ? m.data : hojeLocalISO();
    document.getElementById('input-manutencao-descricao').value = m ? m.descricao : '';
    document.getElementById('input-manutencao-problema').value = m ? (m.problema || '') : '';
    document.getElementById('input-manutencao-solucao').value = m ? (m.solucao || '') : '';

    // Na edição, gastos já lançados são editados em Finanças; aqui só se adiciona um novo
    const tituloGasto = document.querySelector('#wrapper-manutencao-gasto span');
    if (tituloGasto) tituloGasto.textContent = m ? '🛒 Adicionar outro gasto a esta manutenção? (opcional)' : '🛒 Teve gasto nesta manutenção? (opcional)';

    document.getElementById('modal-manutencao')?.classList.remove('hidden');
}

function fecharModalManutencao() {
    document.getElementById('modal-manutencao')?.classList.add('hidden');
}

async function salvarManutencao(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('input-manutencao-id')?.value;
    const impressoraId = parseInt(document.getElementById('input-manutencao-impressora')?.value, 10);
    const data = document.getElementById('input-manutencao-data')?.value;
    const descricao = document.getElementById('input-manutencao-descricao')?.value?.trim();
    const gastoItem = document.getElementById('input-manutencao-gasto-item')?.value?.trim();
    const gastoValor = parseFloat(document.getElementById('input-manutencao-gasto-valor')?.value);

    if (!impressoraId || !data || !descricao) {
        alert('Preencha a impressora, a data e o que foi feito.');
        return;
    }
    if ((gastoItem && !(gastoValor >= 0)) || (!gastoItem && gastoValor > 0)) {
        alert('Para lançar o gasto, informe o item e o valor.');
        return;
    }

    const dados = {
        impressora_id: impressoraId,
        data,
        tipo: document.getElementById('input-manutencao-tipo')?.value || 'Outro',
        descricao,
        problema: document.getElementById('input-manutencao-problema')?.value?.trim() || null,
        solucao: document.getElementById('input-manutencao-solucao')?.value?.trim() || null
    };

    try {
        let manutencaoId = id ? parseInt(id, 10) : null;
        if (id) {
            const { error } = await _supabase.from('manutencoes').update(dados).eq('id', id);
            if (error) throw error;
        } else {
            const { data: criada, error } = await _supabase.from('manutencoes').insert([dados]).select().single();
            if (error) throw error;
            manutencaoId = criada.id;
        }

        if (gastoItem && gastoValor >= 0) {
            const { error: errGasto } = await _supabase.from('despesas').insert([{
                data,
                descricao: gastoItem,
                categoria: 'Manutenção & Peças',
                valor: gastoValor,
                pago: true,
                data_pagamento: data,
                impressora_id: impressoraId,
                manutencao_id: manutencaoId
            }]);
            if (errGasto) throw errGasto;
        }

        fecharModalManutencao();
        await carregarDadosManutencao();
        if (typeof carregarDadosFinanceiros === 'function') carregarDadosFinanceiros();
    } catch (err) {
        alert('Erro ao salvar manutenção: ' + err.message);
    }
}

async function excluirManutencao(id) {
    const m = listaManutencoesGlobal.find(x => x.id === id);
    const gastos = listaGastosManutencaoGlobal.filter(g => g.manutencao_id === id);
    const aviso = gastos.length > 0 ? `\n\nOs ${gastos.length} gasto(s) ligados a ela continuam no Financeiro (exclua em Finanças → Despesas, se necessário).` : '';
    if (!confirm(`Excluir o registro "${m?.descricao || ''}" de ${dataBR(m?.data)}?${aviso}`)) return;

    try {
        const { error } = await _supabase.from('manutencoes').delete().eq('id', id);
        if (error) throw error;
        await carregarDadosManutencao();
    } catch (err) {
        alert('Erro ao excluir manutenção: ' + err.message);
    }
}

window.inicializarModuloManutencao = inicializarModuloManutencao;
window.carregarImpressoras = carregarImpressoras;
window.carregarDadosManutencao = carregarDadosManutencao;
window.filtrarManutencaoPorImpressora = filtrarManutencaoPorImpressora;
window.renderizarHistoricoManutencoes = renderizarHistoricoManutencoes;
window.abrirModalImpressora = abrirModalImpressora;
window.fecharModalImpressora = fecharModalImpressora;
window.salvarImpressora = salvarImpressora;
window.abrirModalManutencao = abrirModalManutencao;
window.fecharModalManutencao = fecharModalManutencao;
window.salvarManutencao = salvarManutencao;
window.excluirManutencao = excluirManutencao;
