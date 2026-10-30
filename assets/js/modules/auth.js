// ==========================================
// MÓDULO DE AUTENTICAÇÃO E SESSÃO (ILUMY3D)
// ==========================================

const adminsAutorizados = ['renato.rustiguelli@gmail.com', 'gaheustaquio@gmail.com'];

// Restaura a sessão real do Supabase (persistida pelo próprio client) ao abrir a página
window.onload = async function() {
    // Remove os flags do login antigo, que não validavam a senha
    localStorage.removeItem('3dcontrol_logado');
    localStorage.removeItem('3dcontrol_email');

    // Link de redefinição expirado ou já usado: o Supabase devolve o erro no hash
    if (_hashAuthInicial.get('error')) {
        limparHashDaUrl();
        mostrarPainelLogin('esqueci');
        mostrarMensagemEsqueci('O link de redefinição expirou ou já foi usado. Peça um novo abaixo.', 'erro');
        return;
    }

    try {
        const { data, error } = await _supabase.auth.getSession();
        if (error) throw error;

        // Veio pelo link do e-mail: pede a nova senha antes de liberar o sistema
        if (_hashAuthInicial.get('type') === 'recovery' && data.session) {
            limparHashDaUrl();
            mostrarPainelLogin('nova-senha');
            return;
        }

        const email = data.session?.user?.email?.toLowerCase();
        if (!email) return;

        if (adminsAutorizados.includes(email)) {
            exibirApp(email);
        } else {
            await _supabase.auth.signOut();
        }
    } catch (err) {
        console.error('Erro ao restaurar sessão do Supabase:', err);
    }
};

async function fazerLogin(event) {
    if (event && event.preventDefault) {
        event.preventDefault();
    }

    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const errorBox = document.getElementById('login-error');

    const mostrarErro = (mensagem) => {
        if (errorBox) {
            errorBox.innerText = mensagem;
            errorBox.classList.remove('hidden');
        }
    };

    if (errorBox) errorBox.classList.add('hidden');

    if (!emailInput || !passwordInput) {
        mostrarErro("Campos do formulário não encontrados.");
        return false;
    }

    const email = emailInput.value.trim().toLowerCase();
    const senha = passwordInput.value;

    if (!email || !senha) {
        mostrarErro("Por favor, preencha o e-mail e a senha.");
        return false;
    }

    if (!adminsAutorizados.includes(email)) {
        mostrarErro("E-mail não autorizado para acesso administrativo.");
        return false;
    }

    // A senha é sempre validada pelo Supabase Auth; sem sessão válida não há acesso
    try {
        const { error } = await _supabase.auth.signInWithPassword({ email, password: senha });
        if (error) {
            const falhaDeRede = !error.status || error.message === 'Failed to fetch';
            mostrarErro(falhaDeRede
                ? "Não foi possível conectar ao servidor de autenticação. Tente novamente."
                : "E-mail ou senha incorretos.");
            return false;
        }
    } catch (err) {
        console.error('Erro na conexão com o Supabase:', err);
        mostrarErro("Não foi possível conectar ao servidor de autenticação. Tente novamente.");
        return false;
    }

    exibirApp(email);
    return false;
}

async function fazerLogout() {
    if (typeof pararSincronizacaoTempoReal === 'function') {
        await pararSincronizacaoTempoReal();
    }

    try {
        await _supabase.auth.signOut();
    } catch (err) {
        console.error('Erro ao encerrar sessão no Supabase:', err);
    }

    const appScreen = document.getElementById('screen-app');
    const loginScreen = document.getElementById('screen-login');
    const passInput = document.getElementById('login-password');

    if (appScreen) appScreen.classList.add('hidden');
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (passInput) passInput.value = '';
}

function exibirApp(email) {
    const loginScreen = document.getElementById('screen-login');
    const appScreen = document.getElementById('screen-app');
    const userDisp = document.getElementById('user-display');

    if (loginScreen) loginScreen.classList.add('hidden');
    if (appScreen) appScreen.classList.remove('hidden');
    if (userDisp) userDisp.innerText = email;

    // Inicia o carregamento dos pedidos quando entra no app
    if (typeof carregarPedidos === 'function') {
        carregarPedidos();
    }

    if (typeof iniciarSincronizacaoTempoReal === 'function') {
        iniciarSincronizacaoTempoReal();
    }

    aplicarTemaDoUsuario();
}

// ==========================================
// TEMA DO USUÁRIO (salvo no cadastro do Supabase Auth)
// ==========================================

async function aplicarTemaDoUsuario() {
    try {
        const { data } = await _supabase.auth.getSession();
        const tema = data.session?.user?.user_metadata?.tema;
        if (tema === 'claro' || tema === 'escuro') aplicarTema(tema);
    } catch (err) {
        console.error('Erro ao carregar o tema do usuário:', err);
    }
    atualizarItemMenuTema();
}

function atualizarItemMenuTema() {
    const item = document.getElementById('item-menu-tema');
    if (item) item.innerText = temaAtual() === 'claro' ? '🌙 Tema escuro' : '☀️ Tema claro';
}

async function alternarTema() {
    const novoTema = temaAtual() === 'claro' ? 'escuro' : 'claro';
    aplicarTema(novoTema);
    document.getElementById('menu-usuario-dropdown').classList.add('hidden');

    // Gráficos têm cores próprias: redesenha o Resumo Financeiro se estiver aberto
    const abaFinancas = document.getElementById('aba-financas');
    if (abaFinancas && !abaFinancas.classList.contains('hidden') && typeof carregarDadosFinanceiros === 'function') {
        carregarDadosFinanceiros();
    }

    try {
        const { error } = await _supabase.auth.updateUser({ data: { tema: novoTema } });
        if (error) throw error;
    } catch (err) {
        console.error('Erro ao salvar o tema no usuário:', err);
    }
}

// ==========================================
// RECUPERAÇÃO E ALTERAÇÃO DE SENHA
// ==========================================

// Endereço para onde o link do e-mail leva. Aberto como arquivo local (file://),
// o link não teria como voltar para a página, então usa o sistema publicado.
const URL_SISTEMA_PUBLICADO = 'https://rgih16.github.io/ily/';
const TAMANHO_MINIMO_SENHA = 8;

function limparHashDaUrl() {
    history.replaceState(null, '', window.location.pathname + window.location.search);
}

function mostrarPainelLogin(painel) {
    const paineis = {
        'login': 'form-login',
        'esqueci': 'form-esqueci-senha',
        'nova-senha': 'form-nova-senha'
    };
    Object.entries(paineis).forEach(([nome, id]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', nome !== painel);
    });

    if (painel === 'esqueci') {
        const emailLogin = document.getElementById('login-email');
        const emailEsqueci = document.getElementById('esqueci-email');
        if (emailLogin && emailEsqueci && !emailEsqueci.value) emailEsqueci.value = emailLogin.value;
        const msg = document.getElementById('esqueci-msg');
        if (msg) msg.classList.add('hidden');
    }
}

function mostrarMensagemEsqueci(mensagem, tipo) {
    const box = document.getElementById('esqueci-msg');
    if (!box) return;
    box.innerText = mensagem;
    box.className = 'p-3 rounded-xl text-xs font-semibold text-center ' + (tipo === 'erro'
        ? 'bg-red-500/10 border border-red-500/30 text-red-400'
        : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400');
}

async function enviarLinkRedefinicao(event) {
    if (event && event.preventDefault) event.preventDefault();

    const email = document.getElementById('esqueci-email').value.trim().toLowerCase();
    const botao = document.getElementById('btn-enviar-link');
    if (!email) return false;

    const redirectTo = window.location.protocol.startsWith('http')
        ? window.location.origin + window.location.pathname
        : URL_SISTEMA_PUBLICADO;

    botao.disabled = true;
    try {
        const { error } = await _supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error && error.status === 429) {
            mostrarMensagemEsqueci('Muitas solicitações em pouco tempo. Aguarde alguns minutos e tente de novo.', 'erro');
            return false;
        }
        if (error) console.error('Erro ao solicitar redefinição de senha:', error);

        // Mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados
        mostrarMensagemEsqueci('Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também a caixa de spam.', 'ok');
    } catch (err) {
        console.error('Erro na conexão com o Supabase:', err);
        mostrarMensagemEsqueci('Não foi possível conectar ao servidor. Tente novamente.', 'erro');
    } finally {
        botao.disabled = false;
    }
    return false;
}

// Traduz os erros do Supabase ao gravar uma senha nova
function mensagemErroNovaSenha(error) {
    if (error.code === 'same_password') return 'A nova senha precisa ser diferente da atual.';
    if (error.code === 'weak_password') return 'Senha muito fraca. Use uma senha mais longa ou com letras e números.';
    if (!error.status || error.message === 'Failed to fetch') return 'Não foi possível conectar ao servidor. Tente novamente.';
    return 'Não foi possível salvar a nova senha. Tente novamente.';
}

function validarNovaSenha(nova, confirma) {
    if (nova.length < TAMANHO_MINIMO_SENHA) return `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
    if (nova !== confirma) return 'As duas senhas digitadas não são iguais.';
    return null;
}

async function salvarNovaSenhaRecuperacao(event) {
    if (event && event.preventDefault) event.preventDefault();

    const nova = document.getElementById('recuperar-senha-nova').value;
    const confirma = document.getElementById('recuperar-senha-confirma').value;
    const errorBox = document.getElementById('nova-senha-erro');
    const botao = document.getElementById('btn-salvar-nova-senha');

    const mostrarErro = (mensagem) => {
        errorBox.innerText = mensagem;
        errorBox.classList.remove('hidden');
    };
    errorBox.classList.add('hidden');

    const invalida = validarNovaSenha(nova, confirma);
    if (invalida) {
        mostrarErro(invalida);
        return false;
    }

    botao.disabled = true;
    try {
        const { data, error } = await _supabase.auth.updateUser({ password: nova });
        if (error) {
            mostrarErro(mensagemErroNovaSenha(error));
            return false;
        }

        document.getElementById('form-nova-senha').reset();
        mostrarPainelLogin('login');

        const email = data.user?.email?.toLowerCase();
        if (email && adminsAutorizados.includes(email)) {
            exibirApp(email);
        } else {
            await _supabase.auth.signOut();
        }
    } catch (err) {
        console.error('Erro ao salvar nova senha:', err);
        mostrarErro('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
        botao.disabled = false;
    }
    return false;
}

function alternarMenuUsuario(event) {
    if (event) event.stopPropagation();
    document.getElementById('menu-usuario-dropdown').classList.toggle('hidden');
}

// Fecha o menu da engrenagem ao clicar em qualquer outro lugar
document.addEventListener('click', (event) => {
    const menu = document.getElementById('menu-usuario');
    const dropdown = document.getElementById('menu-usuario-dropdown');
    if (menu && dropdown && !menu.contains(event.target)) dropdown.classList.add('hidden');
});

function abrirModalAlterarSenha() {
    document.getElementById('menu-usuario-dropdown').classList.add('hidden');
    document.getElementById('form-alterar-senha').reset();
    document.getElementById('alterar-senha-msg').classList.add('hidden');
    document.getElementById('modal-alterar-senha').classList.remove('hidden');
    document.getElementById('alterar-senha-atual').focus();
}

function fecharModalAlterarSenha() {
    document.getElementById('modal-alterar-senha').classList.add('hidden');
    document.getElementById('form-alterar-senha').reset();
}

async function alterarSenha(event) {
    if (event && event.preventDefault) event.preventDefault();

    const atual = document.getElementById('alterar-senha-atual').value;
    const nova = document.getElementById('alterar-senha-nova').value;
    const confirma = document.getElementById('alterar-senha-confirma').value;
    const msgBox = document.getElementById('alterar-senha-msg');
    const botao = document.getElementById('btn-alterar-senha');

    const mostrarMensagem = (mensagem, tipo) => {
        msgBox.innerText = mensagem;
        msgBox.className = 'p-2 rounded-lg text-[11px] font-semibold text-center ' + (tipo === 'erro'
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400');
    };

    const invalida = validarNovaSenha(nova, confirma);
    if (invalida) {
        mostrarMensagem(invalida, 'erro');
        return false;
    }
    if (nova === atual) {
        mostrarMensagem('A nova senha precisa ser diferente da atual.', 'erro');
        return false;
    }

    botao.disabled = true;
    try {
        const { data: sessao } = await _supabase.auth.getSession();
        const email = sessao.session?.user?.email;
        if (!email) {
            mostrarMensagem('Sua sessão expirou. Saia e entre novamente.', 'erro');
            return false;
        }

        // Confere a senha atual antes de trocar, para ninguém alterar com o sistema aberto
        const { error: erroAtual } = await _supabase.auth.signInWithPassword({ email, password: atual });
        if (erroAtual) {
            const falhaDeRede = !erroAtual.status || erroAtual.message === 'Failed to fetch';
            mostrarMensagem(falhaDeRede
                ? 'Não foi possível conectar ao servidor. Tente novamente.'
                : 'Senha atual incorreta.', 'erro');
            return false;
        }

        const { error } = await _supabase.auth.updateUser({ password: nova });
        if (error) {
            mostrarMensagem(mensagemErroNovaSenha(error), 'erro');
            return false;
        }

        document.getElementById('form-alterar-senha').reset();
        mostrarMensagem('Senha alterada com sucesso!', 'ok');
        setTimeout(fecharModalAlterarSenha, 1500);
    } catch (err) {
        console.error('Erro ao alterar senha:', err);
        mostrarMensagem('Não foi possível conectar ao servidor. Tente novamente.', 'erro');
    } finally {
        botao.disabled = false;
    }
    return false;
}
