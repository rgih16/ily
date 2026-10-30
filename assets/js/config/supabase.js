// Configuração e inicialização do Supabase
const SUPABASE_URL = 'https://rqiixcmcpjkrmezvjzbg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Mxhjsfip9u6PF_Yw-GVhNA_3jm6JRQd';

// Lido antes de criar o client, que consome e limpa o hash da URL ao abrir o link do e-mail
const _hashAuthInicial = new URLSearchParams(window.location.hash.substring(1));

const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);