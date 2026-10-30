// assets/js/modules/despesas.js
//
// Aba "Despesas & Investimentos": extrato de tudo que sai do caixa.
// - despesas: gastos avulsos (cola, alicate, frete...), lançamentos mensais dos custos fixos e investimentos
//   em equipamentos (impressoras, upgrades). Peças de manutenção lançadas na aba Manutenção também aparecem aqui.
// - custos_fixos: modelos recorrentes com vigência; geram um lançamento por mês (gerar_lancamentos_custos_fixos).
// - Compras de filamento são lançadas no Estoque e só exibidas aqui como investimento (somente leitura).
// O Resumo Financeiro só lê estes dados.
//
// Depende de financas.js (moedaBR, escaparHtml, hojeISO, ultimoDiaDoMes, CATEGORIAS_DESPESA, CORES_CATEGORIA...).

let listaCustosFixosGlobal = [];
let listaDespesasMesGlobal = [];
let listaContasAPagarGlobal = [];
let listaComprasFilamentoMesGlobal = []; // só leitura: vêm do Estoque (filamento_compras)
let filtroCategoriaDespesas = '';

const formatarMesAno = (data) => {
    const p = typeof data === 'string' && data.match(/^(\d{4})-(\d{2})/);
    return p ? `${p[2]}/${p[1]}` : '-';
};
const dataCurtaBR = (data) => data ? `${String(data).slice(8, 10)}/${String(data).slice(5, 7)}` : '-';

// Mês selecionado na aba Despesas & Investimentos (AAAA-MM)
function mesSelecionadoDespesas() {
    const input = document.getElementById('filtro-despesas-mes');
    if (input && !input.value) input.value = hojeISO().slice(0, 7);
    return input ? input.value : hojeISO().slice(0, 7);
}

// Mês de referência para valores padrão dos modais: o da aba que estiver aberta
function mesDeReferenciaAtual() {
    const abaDespesasVisivel = !document.getElementById('aba-despesas')?.classList.contains('hidden');
    return abaDespesasVisivel ? mesSelecionadoDespesas() : mesSelecionadoFinancas();
}

// Recarrega as telas que mostram despesas depois de qualquer alteração
async function atualizarTelasDeDespesas() {
    if (!document.getElementById('aba-despesas')?.classList.contains('hidden')) await carregarAbaDespesas();
    if (!document.getElementById('aba-financas')?.classList.contains('hidden') && typeof carregarDadosFinanceiros === 'function') await carregarDadosFinanceiros();
    if (!document.getElementById('aba-manutencao')?.classList.contains('hidden') && typeof carregarDadosManutencao === 'function') await carregarDadosManutencao();
}

// ==========================================
// CARGA DE DADOS
// ==========================================
// Gera os lançamentos dos custos fixos do mês (idempotente) e devolve as despesas do mês
async function carregarDespesasDoMes(anoMes) {
    const client = obterSupabaseClient();
    if (!client) return [];

    const { error: errGerar } = await client.rpc('gerar_lancamentos_custos_fixos', { p_mes: `${anoMes}-01` });
    if (errGerar) console.warn('Aviso ao gerar lançamentos de custos fixos:', errGerar.message);

    const { data, error } = await client
        .from('despesas')
        .select('*')
        .gte('data', `${anoMes}-01`)
        .lte('data', ultimoDiaDoMes(anoMes))
        .order('data', { ascending: true });
    if (error) throw error;

    return data || [];
}

async function carregarCustosFixos() {
    try {
        const { data, error } = await obterSupabaseClient()
            .from('custos_fixos')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;

        listaCustosFixosGlobal = data || [];
        renderizarListaCustosFixos();
    } catch (err) {
        console.error('Erro ao carregar custos fixos:', err.message);
    }
}

async function inicializarModuloDespesas() {
    mesSelecionadoDespesas();
    const selCat = document.getElementById('filtro-despesas-categoria');
    if (selCat && selCat.options.length <= 1) {
        selCat.innerHTML = `<option value="">Todas as categorias</option>` +
            CATEGORIAS_DESPESA.filter(c => c !== CATEGORIA_INVESTIMENTO).map(c => `<option value="${c}">${c}</option>`).join('');
    }
    if (typeof carregarImpressoras === 'function' && (typeof listaImpressorasGlobal === 'undefined' || listaImpressorasGlobal.length === 0)) {
        await carregarImpressoras();
    }
    await carregarCustosFixos();
    await carregarAbaDespesas();
}

async function carregarAbaDespesas() {
    const anoMes = mesSelecionadoDespesas();
    try {
        const client = obterSupabaseClient();
        const [doMes, { data: pendentes, error: errPendentes }, { data: compras, error: errCompras }, { data: filamentos }] = await Promise.all([
            carregarDespesasDoMes(anoMes),
            client.from('despesas').select('*').eq('pago', false).lte('data', ultimoDiaDoMes(anoMes)).order('data', { ascending: true }),
            client.from('filamento_compras').select('*').gte('data_compra', `${anoMes}-01`).lte('data_compra', ultimoDiaDoMes(anoMes)).order('data_compra', { ascending: true }),
            client.from('filamentos').select('id, material, cor')
        ]);
        if (errPendentes) throw errPendentes;
        if (errCompras) console.warn('Aviso ao carregar compras de filamento:', errCompras.message);

        const nomePorId = {};
        (filamentos || []).forEach(f => { nomePorId[f.id] = `${f.material || ''} ${f.cor || ''}`.trim(); });
        listaComprasFilamentoMesGlobal = (compras || []).map(c => ({ ...c, nome_filamento: nomePorId[c.filamento_id] || 'Filamento excluído' }));

        listaDespesasMesGlobal = doMes;
        listaContasAPagarGlobal = (pendentes || []).filter(d => Number(d.valor) > 0 && d.categoria !== CATEGORIA_INVESTIMENTO);
        renderizarAbaDespesas();
    } catch (err) {
        console.error('Erro ao carregar contas e despesas:', err.message || err);
    }
}

// ==========================================
// RENDERIZAÇÃO DA ABA
// ==========================================
function itemDespesaHtml(d, { mostrarVencimento = false } = {}) {
    const impressoras = (typeof listaImpressorasGlobal !== 'undefined') ? listaImpressorasGlobal : [];
    const impressora = d.impressora_id ? impressoras.find(i => i.id === d.impressora_id) : null;
    const vencida = !d.pago && d.data < hojeISO();
    const cancelado = Number(d.valor) === 0 && d.custo_fixo_id;

    return `
        <div class="flex items-center justify-between gap-2 py-2 border-b border-slate-800/60 ${cancelado ? 'opacity-40' : ''}">
            <div class="min-w-0">
                <div class="font-semibold text-slate-200 truncate" title="${escaparHtml(d.observacao || '')}">${d.custo_fixo_id ? '🔁 ' : ''}${escaparHtml(d.descricao)}</div>
                <div class="flex items-center gap-1 flex-wrap mt-0.5">
                    <span class="text-[10px] font-mono ${vencida ? 'text-red-400 font-bold' : 'text-slate-500'}">${mostrarVencimento ? 'vence ' : ''}${dataCurtaBR(d.data)}${vencida ? ' · vencida' : ''}</span>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${CORES_CATEGORIA[d.categoria] || CORES_CATEGORIA['Outros']}">${escaparHtml(d.categoria)}</span>
                    ${impressora ? `<span class="text-[9px] text-slate-400">🖨️ ${escaparHtml(impressora.nome)}</span>` : ''}
                    ${d.pago && d.data_pagamento && d.data_pagamento !== d.data ? `<span class="text-[9px] text-slate-500">pago ${dataCurtaBR(d.data_pagamento)}</span>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <span class="font-mono font-bold text-rose-300">${moedaBR(d.valor)}</span>
                <button onclick="alternarPagamentoDespesa(${d.id})" class="text-[9px] font-bold px-1.5 py-0.5 rounded border transition ${d.pago ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300' : 'bg-amber-950/60 border-amber-700/60 text-amber-300'}" title="Clique para alternar">${d.pago ? '✔ Pago' : '⏳ Pendente'}</button>
                <button onclick="abrirModalDespesa({ id: ${d.id} })" class="p-1 text-slate-400 hover:text-rose-300 transition" title="Editar">✏️</button>
                <button onclick="excluirDespesa(${d.id})" class="p-1 text-slate-400 hover:text-red-400 transition" title="Excluir">🗑️</button>
            </div>
        </div>`;
}

function renderizarAbaDespesas() {
    const despesas = listaDespesasMesGlobal.filter(d => d.categoria !== CATEGORIA_INVESTIMENTO);
    const investimentos = listaDespesasMesGlobal.filter(d => d.categoria === CATEGORIA_INVESTIMENTO);
    const somar = (lista) => lista.reduce((acc, d) => acc + Number(d.valor || 0), 0);
    const setTexto = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };

    // Cards
    const pagas = despesas.filter(d => d.pago);
    const pendentes = despesas.filter(d => !d.pago);
    const vencidas = listaContasAPagarGlobal.filter(d => d.data < hojeISO());
    setTexto('despesas-card-total', moedaBR(somar(despesas)));
    setTexto('despesas-card-total-sub', `${despesas.filter(d => Number(d.valor) > 0).length} lançamento(s) no mês`);
    setTexto('despesas-card-pago', moedaBR(somar(pagas)));
    setTexto('despesas-card-pendente', moedaBR(somar(pendentes)));
    setTexto('despesas-card-vencidas', moedaBR(somar(vencidas)));
    setTexto('despesas-card-vencidas-sub', vencidas.length ? `${vencidas.length} conta(s) vencida(s)` : 'Nenhuma conta vencida');

    // Lista do mês (com filtro de categoria)
    const elLista = document.getElementById('lista-despesas-aba');
    if (elLista) {
        const filtradas = filtroCategoriaDespesas ? despesas.filter(d => d.categoria === filtroCategoriaDespesas) : despesas;
        elLista.innerHTML = filtradas.length
            ? filtradas.map(d => itemDespesaHtml(d)).join('')
            : `<p class="text-slate-500 italic text-xs text-center py-6">Nenhuma despesa ${filtroCategoriaDespesas ? 'nesta categoria ' : ''}neste mês. Use "+ Nova Despesa".</p>`;
    }

    // Totais por categoria (barrinhas)
    const elCategorias = document.getElementById('despesas-por-categoria');
    if (elCategorias) {
        const total = somar(despesas) || 1;
        const porCategoria = CATEGORIAS_DESPESA
            .filter(c => c !== CATEGORIA_INVESTIMENTO)
            .map(c => ({ c, v: somar(despesas.filter(d => d.categoria === c)) }))
            .filter(x => x.v > 0)
            .sort((a, b) => b.v - a.v);
        elCategorias.innerHTML = porCategoria.length
            ? porCategoria.map(x => `
                <button onclick="filtrarDespesasPorCategoria('${x.c}')" class="w-full text-left space-y-0.5 group">
                    <div class="flex justify-between text-[11px]"><span class="text-slate-300 group-hover:text-white ${filtroCategoriaDespesas === x.c ? 'font-bold text-white' : ''}">${x.c}</span><span class="font-mono text-slate-300">${moedaBR(x.v)}</span></div>
                    <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-rose-500/70 rounded-full" style="width:${Math.max(4, (x.v / total) * 100)}%"></div></div>
                </button>`).join('')
            : `<p class="text-slate-500 italic text-[11px] text-center py-2">Sem despesas no mês.</p>`;
    }

    // Contas a pagar (pendentes até o fim do mês selecionado, inclusive de meses anteriores)
    const elPagar = document.getElementById('lista-contas-a-pagar');
    setTexto('total-contas-a-pagar', moedaBR(somar(listaContasAPagarGlobal)));
    if (elPagar) {
        elPagar.innerHTML = listaContasAPagarGlobal.length
            ? listaContasAPagarGlobal.map(d => itemDespesaHtml(d, { mostrarVencimento: true })).join('')
            : `<p class="text-slate-500 italic text-[11px] text-center py-3">Nada pendente. 🎉</p>`;
    }

    // Investimentos: equipamentos/bens lançados aqui + compras de filamento vindas do Estoque (só leitura)
    const totalEquipamentos = somar(investimentos);
    const totalFilamento = listaComprasFilamentoMesGlobal.reduce((acc, c) => acc + Number(c.valor_pago || 0), 0);
    setTexto('total-investimentos-equipamentos', moedaBR(totalEquipamentos));
    setTexto('total-investimentos-filamento', moedaBR(totalFilamento));
    setTexto('total-investimentos-despesas', moedaBR(totalEquipamentos + totalFilamento));
    setTexto('despesas-card-investimentos', moedaBR(totalEquipamentos + totalFilamento));
    setTexto('despesas-card-investimentos-sub', `Filamento ${moedaBR(totalFilamento)} · Equip. ${moedaBR(totalEquipamentos)}`);

    const elInv = document.getElementById('lista-investimentos-despesas');
    if (elInv) {
        elInv.innerHTML = investimentos.length
            ? investimentos.map(d => itemDespesaHtml(d)).join('')
            : `<p class="text-slate-500 italic text-[11px] text-center py-3">Nenhum equipamento neste mês. Use "📦 + Investimento".</p>`;
    }

    const elFil = document.getElementById('lista-investimentos-filamento');
    if (elFil) {
        elFil.innerHTML = listaComprasFilamentoMesGlobal.length
            ? listaComprasFilamentoMesGlobal.map(c => `
                <div class="flex items-center justify-between gap-2 py-2 border-b border-slate-800/60">
                    <div class="min-w-0">
                        <div class="font-semibold text-slate-200 truncate">${escaparHtml(c.nome_filamento)} · ${Math.round(Number(c.peso_g || 0))}g</div>
                        <div class="flex items-center gap-1 flex-wrap mt-0.5">
                            <span class="text-[10px] font-mono text-slate-500">${dataCurtaBR(c.data_compra)}</span>
                            ${c.marca ? `<span class="text-[9px] text-slate-400">${escaparHtml(c.marca)}</span>` : ''}
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-purple-950/80 border-purple-700/60 text-purple-300">🧵 via Estoque</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="font-mono font-bold text-purple-300">${moedaBR(c.valor_pago)}</span>
                        <button onclick="trocarAba('estoque'); carregarFilamentos();" class="text-[10px] text-indigo-400 hover:text-indigo-300 px-1" title="Compras de filamento são editadas no Estoque Filamentos (Histórico)">ver →</button>
                    </div>
                </div>`).join('')
            : `<p class="text-slate-500 italic text-[11px] text-center py-3">Nenhuma compra de filamento neste mês.</p>`;
    }
}

function filtrarDespesasPorCategoria(categoria) {
    filtroCategoriaDespesas = filtroCategoriaDespesas === categoria ? '' : categoria;
    const sel = document.getElementById('filtro-despesas-categoria');
    if (sel) sel.value = filtroCategoriaDespesas;
    renderizarAbaDespesas();
}

// ==========================================
// CUSTOS FIXOS RECORRENTES (MODELOS COM VIGÊNCIA)
// ==========================================
function renderizarListaCustosFixos() {
    const el = document.getElementById('lista-custos-fixos');
    if (!el) return;

    if (listaCustosFixosGlobal.length === 0) {
        el.innerHTML = `<p class="text-slate-500 italic text-[11px] text-center py-2">Nenhum custo fixo cadastrado.</p>`;
        return;
    }

    const mesAtual = hojeISO().slice(0, 7);
    const ativos = listaCustosFixosGlobal.filter(c => !(c.fim && String(c.fim).slice(0, 7) < mesAtual));
    const totalMensal = ativos.reduce((acc, c) => acc + Number(c.valor || 0), 0);
    const elTotal = document.getElementById('total-custos-fixos');
    if (elTotal) elTotal.textContent = `${moedaBR(totalMensal)}/mês`;

    el.innerHTML = listaCustosFixosGlobal.map(c => {
        const encerrado = c.fim && String(c.fim).slice(0, 7) < mesAtual;
        const vigencia = c.fim ? `${formatarMesAno(c.inicio)} → ${formatarMesAno(c.fim)}` : `desde ${formatarMesAno(c.inicio)}`;
        return `
            <div class="flex items-center justify-between gap-2 py-2 border-b border-slate-800/60 ${encerrado ? 'opacity-50' : ''}">
                <div class="min-w-0">
                    <div class="font-semibold text-slate-200 truncate">${escaparHtml(c.nome)}</div>
                    <div class="text-[10px] text-slate-500 font-mono">${escaparHtml(c.categoria || 'Custo fixo')} · dia ${c.dia_vencimento || '-'} · ${vigencia}${encerrado ? ' · encerrado' : ''}</div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <span class="font-mono text-slate-200 font-bold">${moedaBR(c.valor)}</span>
                    <button onclick="abrirModalCustoFixo(${c.id})" class="p-1 text-slate-400 hover:text-indigo-400 transition" title="Editar">✏️</button>
                    ${!c.fim ? `<button onclick="encerrarCustoFixo(${c.id})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="Encerrar (para de gerar nos próximos meses)">⏹️</button>` : ''}
                    <button onclick="excluirCustoFixo(${c.id})" class="p-1 text-slate-400 hover:text-red-400 transition" title="Excluir">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function preencherSelectCategorias(selectId, selecionada) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = CATEGORIAS_DESPESA.map(c => `<option value="${c}" ${c === selecionada ? 'selected' : ''}>${c}</option>`).join('');
}

function abrirModalCustoFixo(id = null) {
    const custo = id ? listaCustosFixosGlobal.find(c => c.id === id) : null;
    document.getElementById('form-custo-fixo')?.reset();

    document.getElementById('modal-custo-fixo-titulo').textContent = custo ? '✏️ Editar Custo Fixo' : '🔁 Novo Custo Fixo';
    document.getElementById('input-custo-id').value = custo ? custo.id : '';
    document.getElementById('input-custo-nome').value = custo ? custo.nome : '';
    document.getElementById('input-custo-valor').value = custo ? custo.valor : '';
    document.getElementById('input-custo-dia').value = custo ? (custo.dia_vencimento || 10) : 10;
    document.getElementById('input-custo-inicio').value = custo ? String(custo.inicio).slice(0, 7) : mesDeReferenciaAtual();
    document.getElementById('input-custo-fim').value = custo && custo.fim ? String(custo.fim).slice(0, 7) : '';
    preencherSelectCategorias('input-custo-categoria', custo ? custo.categoria : 'Custo fixo');
    document.getElementById('aviso-edicao-custo-fixo')?.classList.toggle('hidden', !custo);

    document.getElementById('modal-custo-fixo')?.classList.remove('hidden');
}

function fecharModalCustoFixo() {
    document.getElementById('modal-custo-fixo')?.classList.add('hidden');
}

async function salvarCustoFixo(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('input-custo-id')?.value;
    const nome = document.getElementById('input-custo-nome')?.value?.trim();
    const valor = parseFloat(document.getElementById('input-custo-valor')?.value);
    const dia = parseInt(document.getElementById('input-custo-dia')?.value, 10) || 1;
    const categoria = document.getElementById('input-custo-categoria')?.value || 'Custo fixo';
    const inicioMes = document.getElementById('input-custo-inicio')?.value;
    const fimMes = document.getElementById('input-custo-fim')?.value;

    if (!nome || !(valor > 0) || !inicioMes) {
        alert('Preencha a descrição, um valor válido e o mês de início.');
        return;
    }
    if (fimMes && fimMes < inicioMes) {
        alert('O mês de término não pode ser antes do início.');
        return;
    }

    const dados = {
        nome, valor, categoria,
        dia_vencimento: dia,
        inicio: `${inicioMes}-01`,
        fim: fimMes ? ultimoDiaDoMes(fimMes) : null
    };

    try {
        const client = obterSupabaseClient();
        const { error } = id
            ? await client.from('custos_fixos').update(dados).eq('id', id)
            : await client.from('custos_fixos').insert([dados]);
        if (error) throw error;

        fecharModalCustoFixo();
        await carregarCustosFixos();
        await atualizarTelasDeDespesas();
    } catch (err) {
        alert('Erro ao salvar custo fixo: ' + err.message);
    }
}

async function encerrarCustoFixo(id) {
    const custo = listaCustosFixosGlobal.find(c => c.id === id);
    if (!custo) return;
    const mesAtual = hojeISO().slice(0, 7);
    if (!confirm(`Encerrar "${custo.nome}"?\n\nEle continua valendo até ${formatarMesAno(mesAtual)} e para de ser lançado a partir do mês seguinte. O histórico dos meses anteriores é mantido.`)) return;

    try {
        const { error } = await obterSupabaseClient().from('custos_fixos').update({ fim: ultimoDiaDoMes(mesAtual) }).eq('id', id);
        if (error) throw error;
        await carregarCustosFixos();
        await atualizarTelasDeDespesas();
    } catch (err) {
        alert('Erro ao encerrar custo fixo: ' + err.message);
    }
}

async function excluirCustoFixo(id) {
    const custo = listaCustosFixosGlobal.find(c => c.id === id);
    if (!confirm(`Excluir o custo fixo "${custo?.nome || ''}"?\n\nOs lançamentos dos meses já gerados continuam em Despesas (histórico preservado). Para só parar de cobrar, prefira "Encerrar" (⏹️).`)) return;

    try {
        const { error } = await obterSupabaseClient().from('custos_fixos').delete().eq('id', id);
        if (error) throw error;
        await carregarCustosFixos();
        await atualizarTelasDeDespesas();
    } catch (err) {
        alert('Erro ao excluir custo fixo: ' + err.message);
    }
}

// ==========================================
// MODAL E AÇÕES DE DESPESA
// ==========================================
async function buscarDespesaPorId(id) {
    const local = [...listaDespesasMesGlobal, ...listaContasAPagarGlobal].find(d => d.id === id);
    if (local) return local;
    const { data } = await obterSupabaseClient().from('despesas').select('*').eq('id', id).single();
    return data || null;
}

// Abre o modal de despesa. opcoes: { id } para editar, ou { categoria, impressora_id, data } para pré-preencher
async function abrirModalDespesa(opcoes = {}) {
    const despesa = opcoes.id ? await buscarDespesaPorId(opcoes.id) : null;
    document.getElementById('form-despesa')?.reset();

    if (typeof carregarImpressoras === 'function' && (typeof listaImpressorasGlobal === 'undefined' || listaImpressorasGlobal.length === 0)) {
        await carregarImpressoras();
    }

    const mesRef = mesDeReferenciaAtual();
    const hoje = hojeISO();
    const dataPadrao = hoje.slice(0, 7) === mesRef ? hoje : `${mesRef}-01`;

    document.getElementById('modal-despesa-titulo').textContent = despesa ? '✏️ Editar Despesa' : (opcoes.categoria === CATEGORIA_INVESTIMENTO ? '📦 Novo Investimento' : '💸 Nova Despesa');
    document.getElementById('input-despesa-id').value = despesa ? despesa.id : '';
    document.getElementById('input-despesa-descricao').value = despesa ? despesa.descricao : '';
    document.getElementById('input-despesa-valor').value = despesa ? despesa.valor : '';
    document.getElementById('input-despesa-data').value = despesa ? despesa.data : (opcoes.data || dataPadrao);
    document.getElementById('input-despesa-pago').checked = despesa ? !!despesa.pago : true;
    document.getElementById('input-despesa-data-pagamento').value = despesa
        ? (despesa.data_pagamento || (despesa.pago ? despesa.data : hoje))
        : (opcoes.data || dataPadrao);
    document.getElementById('input-despesa-observacao').value = despesa ? (despesa.observacao || '') : '';
    preencherSelectCategorias('input-despesa-categoria', despesa ? despesa.categoria : (opcoes.categoria || 'Consumíveis'));

    const selImp = document.getElementById('input-despesa-impressora');
    if (selImp) {
        const impressoras = (typeof listaImpressorasGlobal !== 'undefined') ? listaImpressorasGlobal : [];
        const selecionada = despesa ? despesa.impressora_id : opcoes.impressora_id;
        selImp.innerHTML = `<option value="">— Geral / várias impressoras —</option>` +
            impressoras.map(i => `<option value="${i.id}" ${String(i.id) === String(selecionada) ? 'selected' : ''}>${escaparHtml(i.nome)}${i.modelo ? ` (${escaparHtml(i.modelo)})` : ''}</option>`).join('');
    }
    atualizarCamposDespesa();

    document.getElementById('modal-despesa')?.classList.remove('hidden');
    document.getElementById('input-despesa-descricao')?.focus();
}

const CATEGORIAS_COM_IMPRESSORA = ['Manutenção & Peças', CATEGORIA_INVESTIMENTO];

function atualizarCamposDespesa() {
    const categoria = document.getElementById('input-despesa-categoria')?.value;
    const pago = document.getElementById('input-despesa-pago')?.checked;
    document.getElementById('wrapper-despesa-impressora')?.classList.toggle('hidden', !CATEGORIAS_COM_IMPRESSORA.includes(categoria));
    document.getElementById('wrapper-despesa-data-pagamento')?.classList.toggle('hidden', !pago);
}

function fecharModalDespesa() {
    document.getElementById('modal-despesa')?.classList.add('hidden');
}

async function salvarDespesa(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('input-despesa-id')?.value;
    const descricao = document.getElementById('input-despesa-descricao')?.value?.trim();
    const valor = parseFloat(document.getElementById('input-despesa-valor')?.value);
    const data = document.getElementById('input-despesa-data')?.value;
    const categoria = document.getElementById('input-despesa-categoria')?.value || 'Outros';
    const impressoraId = document.getElementById('input-despesa-impressora')?.value;

    if (!descricao || isNaN(valor) || valor < 0 || !data) {
        alert('Preencha a descrição, o valor e a data.');
        return;
    }

    const pago = document.getElementById('input-despesa-pago')?.checked ?? true;
    const dados = {
        descricao, valor, data, categoria, pago,
        data_pagamento: pago ? (document.getElementById('input-despesa-data-pagamento')?.value || data) : null,
        observacao: document.getElementById('input-despesa-observacao')?.value?.trim() || null,
        impressora_id: CATEGORIAS_COM_IMPRESSORA.includes(categoria) && impressoraId ? parseInt(impressoraId, 10) : null
    };

    try {
        const client = obterSupabaseClient();
        const { error } = id
            ? await client.from('despesas').update(dados).eq('id', id)
            : await client.from('despesas').insert([dados]);
        if (error) throw error;

        fecharModalDespesa();
        await atualizarTelasDeDespesas();
    } catch (err) {
        alert('Erro ao salvar despesa: ' + err.message);
    }
}

async function alternarPagamentoDespesa(id) {
    const despesa = await buscarDespesaPorId(id);
    if (!despesa) return;
    try {
        // Marcar como pago grava hoje como data do pagamento (ajustável no ✏️); desmarcar limpa a data
        const { error } = await obterSupabaseClient()
            .from('despesas')
            .update({ pago: !despesa.pago, data_pagamento: despesa.pago ? null : hojeISO() })
            .eq('id', id);
        if (error) throw error;
        await atualizarTelasDeDespesas();
    } catch (err) {
        alert('Erro ao atualizar despesa: ' + err.message);
    }
}

async function excluirDespesa(id) {
    const despesa = await buscarDespesaPorId(id);
    const aviso = despesa?.custo_fixo_id
        ? '\n\nEste é um lançamento de custo fixo: ele não será gerado de novo para este mês. Para parar de cobrar nos próximos meses, encerre o custo fixo.'
        : '';
    if (!confirm(`Excluir a despesa "${despesa?.descricao || ''}" (${moedaBR(despesa?.valor)})?${aviso}`)) return;

    try {
        // Lançamento de custo fixo: zera em vez de apagar, para a geração automática não recriá-lo
        const client = obterSupabaseClient();
        const { error } = despesa?.custo_fixo_id
            ? await client.from('despesas').update({ valor: 0, pago: true, observacao: 'Lançamento cancelado' }).eq('id', id)
            : await client.from('despesas').delete().eq('id', id);
        if (error) throw error;

        await atualizarTelasDeDespesas();
    } catch (err) {
        alert('Erro ao excluir despesa: ' + err.message);
    }
}

window.inicializarModuloDespesas = inicializarModuloDespesas;
window.carregarAbaDespesas = carregarAbaDespesas;
window.filtrarDespesasPorCategoria = filtrarDespesasPorCategoria;
window.abrirModalCustoFixo = abrirModalCustoFixo;
window.fecharModalCustoFixo = fecharModalCustoFixo;
window.salvarCustoFixo = salvarCustoFixo;
window.encerrarCustoFixo = encerrarCustoFixo;
window.excluirCustoFixo = excluirCustoFixo;
window.abrirModalDespesa = abrirModalDespesa;
window.fecharModalDespesa = fecharModalDespesa;
window.salvarDespesa = salvarDespesa;
window.atualizarCamposDespesa = atualizarCamposDespesa;
window.alternarPagamentoDespesa = alternarPagamentoDespesa;
window.excluirDespesa = excluirDespesa;
