// ==========================================
// MÓDULO DE AUTENTICAÇÃO E SESSÃO (ILUMY3D)
// ==========================================

const adminsAutorizados = ['renato.rustiguelli@gmail.com', 'gaheustaquio@gmail.com'];

// Restaura a sessão real do Supabase (persistida pelo próprio client) ao abrir a página
window.onload = async function() {
    // Remove os flags do login antigo, que não validavam a senha
    localStorage.removeItem('3dcontrol_logado');
    localStorage.removeItem('3dcontrol_email');

    try {
        const { data, error } = await _supabase.auth.getSession();
        if (error) throw error;

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
}
