/* Neto Parceiros — site dos parceiros (home care, clínicas e prefeituras).
   Segurança:
   - Nenhum script de terceiros: este arquivo conversa direto com o banco do Neto.
   - Só usa a chave pública; tudo passa por funções do banco que conferem quem pede.
   - Sessão guardada só nesta aba (sessionStorage) e encerrada após 30 min sem uso.
   - Todo texto vindo do banco é escapado antes de aparecer na tela. */
(function () {
  "use strict";

  var API = "https://unesfkmxactooxaemkvo.supabase.co";
  var KEY = "sb_publishable_UM4p0NWHEAKWr68ZQL0Rmg_9HhORDRr";
  var CONTATO = "alarconlll59@gmail.com";
  var PRIVACIDADE = "https://netoapp.com.br/privacidade/";
  var INATIVO_MS = 30 * 60 * 1000;
  var SK = "neto_parceiros_sessao";

  /* ---------------- utilidades ---------------- */
  var app = document.getElementById("app");
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function so(v) { return String(v || "").replace(/\D/g, ""); }
  function brl(v, d) {
    return "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d ? 2 : 0, maximumFractionDigits: d ? 2 : 0 });
  }
  function fmtCnpj(v) { var d = so(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : v || ""; }
  function fmtCpf(v) { var d = so(v); return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : v || ""; }
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function nomeMes(iso) { var m = /^(\d{4})-(\d{2})/.exec(iso || ""); return m ? MESES[+m[2] - 1].replace(/^./, function (c) { return c.toUpperCase(); }) + "/" + m[1] : ""; }
  function dataBr(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR"); }
  function dataHora(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function iniciais(n) { return String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase(); }
  var CORES = ["#7c4dbd", "#1f6fae", "#e07b39", "#1f8a4c", "#b0482f", "#a8741a", "#2f7f8a"];
  function cor(n) { var s = 0; String(n).split("").forEach(function (c) { s += c.charCodeAt(0); }); return CORES[s % CORES.length]; }
  function idade(iso) { if (!iso) return ""; var b = new Date(iso), n = new Date(); var a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a > 0 && a < 130 ? a + " anos" : ""; }
  function nivelClasse(n) { return n === "boa" ? "n-boa" : n === "atencao" ? "n-atencao" : n ? "n-ruim" : ""; }
  function aviso(msg) {
    var el = document.getElementById("aviso"); el.textContent = msg; el.classList.add("on");
    clearTimeout(aviso.t); aviso.t = setTimeout(function () { el.classList.remove("on"); }, 3500);
  }
  function copiar(txt) {
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { aviso("Copiado."); }, function () { aviso("Não foi possível copiar."); });
  }
  function cnpjValido(c) {
    c = so(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    function dv(n) { var p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; var s = 0; for (var i = 0; i < n; i++) s += +c[i] * p[i]; var r = s % 11; return r < 2 ? 0 : 11 - r; }
    return dv(12) === +c[12] && dv(13) === +c[13];
  }
  function cpfValido(c) {
    c = so(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    function dv(n) { var s = 0; for (var i = 0; i < n; i++) s += +c[i] * (n + 1 - i); var r = (s * 10) % 11; return r === 10 ? 0 : r; }
    return dv(9) === +c[9] && dv(10) === +c[10];
  }
  function mascara(el, tipo) {
    el.addEventListener("input", function () {
      var d = so(el.value);
      if (tipo === "cnpj") { d = d.slice(0, 14); el.value = d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"); }
      if (tipo === "cpf") { d = d.slice(0, 11); el.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
    });
  }

  /* ---------------- sessão ---------------- */
  var sessao = null;
  try { sessao = JSON.parse(sessionStorage.getItem(SK) || "null"); } catch (e) { sessao = null; }
  function guardar(s) {
    sessao = s;
    try { if (s) sessionStorage.setItem(SK, JSON.stringify(s)); else sessionStorage.removeItem(SK); } catch (e) { /* sem armazenamento: fica só na memória */ }
  }
  function deSessao(r) {
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in || 3600) * 1000, user: r.user, visto: Date.now() };
  }
  var ultimoUso = Date.now();
  ["click", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { ultimoUso = Date.now(); }, { passive: true }); });
  setInterval(function () {
    if (sessao && Date.now() - ultimoUso > INATIVO_MS) { sair(true); }
  }, 30000);

  /* ---------------- conversa com o banco ---------------- */
  function erroAmigavel(j, status) {
    var m = (j && (j.message || j.error_description || j.msg || j.error)) || "";
    if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/already registered|already been registered|User already/i.test(m)) return "Este e-mail já tem conta. Use \"Já tenho conta\".";
    if (/Email not confirmed/i.test(m)) return "Confirme o seu e-mail antes de entrar.";
    if (/Password should|weak|pwned|leaked/i.test(m)) return "Escolha uma senha mais forte (pelo menos 8 caracteres, com letras e números, que não seja comum).";
    if (/rate limit|too many/i.test(m) || status === 429) return "Muitas tentativas. Aguarde alguns minutos.";
    if (/JWT|expired/i.test(m)) return "Sua sessão expirou. Entre de novo.";
    if (/permission denied/i.test(m)) return "Você não tem acesso a esta parte.";
    return m || "Não foi possível concluir. Tente de novo.";
  }
  function pedir(caminho, opts) {
    opts = opts || {};
    var h = { apikey: KEY };
    if (opts.json !== undefined) h["Content-Type"] = "application/json";
    if (opts.token) h.Authorization = "Bearer " + opts.token;
    Object.keys(opts.headers || {}).forEach(function (k) { h[k] = opts.headers[k]; });
    return fetch(API + caminho, {
      method: opts.method || "POST", headers: h, credentials: "omit", cache: "no-store",
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
        if (!r.ok) { var err = new Error(erroAmigavel(j, r.status)); err.status = r.status; throw err; }
        return j;
      });
    }, function () { throw new Error("Sem conexão. Confira a internet e tente de novo."); });
  }
  function tokenValido() {
    if (!sessao) return Promise.resolve(null);
    if (sessao.expires_at - Date.now() > 60000) return Promise.resolve(sessao.access_token);
    return pedir("/auth/v1/token?grant_type=refresh_token", { json: { refresh_token: sessao.refresh_token } })
      .then(function (r) { guardar(deSessao(r)); return sessao.access_token; }, function () { guardar(null); return null; });
  }
  function rpc(nome, args) {
    return tokenValido().then(function (tk) {
      return pedir("/rest/v1/rpc/" + nome, { json: args || {}, token: tk || undefined });
    }).catch(function (e) {
      if (e.status === 401) { guardar(null); ir("entrar"); }
      throw e;
    });
  }
  function entrar(email, senha) {
    return pedir("/auth/v1/token?grant_type=password", { json: { email: email, password: senha } }).then(function (r) { guardar(deSessao(r)); });
  }
  function criarConta(nome, email, senha) {
    return pedir("/auth/v1/signup", { json: { email: email, password: senha, data: { full_name: nome } } }).then(function (r) {
      if (r && r.access_token) { guardar(deSessao(r)); return true; }
      return false; // precisa confirmar e-mail
    });
  }
  function sair(porInatividade) {
    var tk = sessao && sessao.access_token;
    guardar(null);
    if (tk) pedir("/auth/v1/logout", { token: tk }).catch(function () {});
    if (porInatividade) aviso("Por segurança, saímos depois de 30 minutos sem uso.");
    ir("entrar");
  }
  function enviarDocumento(arquivo) {
    if (!arquivo) return Promise.resolve(null);
    var tipos = ["image/jpeg", "image/png", "application/pdf"];
    if (tipos.indexOf(arquivo.type) < 0) return Promise.reject(new Error("Envie o documento em JPG, PNG ou PDF."));
    if (arquivo.size > 8 * 1024 * 1024) return Promise.reject(new Error("O arquivo passa de 8 MB. Envie uma foto menor."));
    var ext = arquivo.type === "application/pdf" ? "pdf" : arquivo.type === "image/png" ? "png" : "jpg";
    return tokenValido().then(function (tk) {
      if (!tk) throw new Error("Sua sessão expirou. Entre de novo.");
      var caminho = sessao.user.id + "/parceiro-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
      return pedir("/storage/v1/object/documentos/" + caminho, { token: tk, body: arquivo, headers: { "Content-Type": arquivo.type, "x-upsert": "false" } })
        .then(function () { return caminho; });
    });
  }

  /* ---------------- rotas ---------------- */
  var timers = [];
  function limparTimers() { timers.forEach(clearInterval); timers = []; }
  function ir(r) { if (location.hash !== "#/" + r) location.hash = "#/" + r; else rotear(); }
  function rotaAtual() { return (location.hash || "#/").replace(/^#\/?/, ""); }
  window.addEventListener("hashchange", rotear);

  var org = null;
  function rotear() {
    limparTimers();
    var r = rotaAtual(), partes = r.split("/");
    window.scrollTo(0, 0);
    if (r === "" ) return telaInicio();
    if (r === "cadastro") return telaCadastro();
    if (r === "entrar") return telaEntrar();
    if (r === "esqueci") return telaEsqueci();
    if (r === "equipe") return telaEntrarEquipe();
    if (partes[0] === "painel") return painel(partes.slice(1));
    return telaInicio();
  }

  /* ---------------- telas públicas ---------------- */
  function pub(conteudo) {
    app.innerHTML =
      '<div class="pub"><header class="pub-top"><div class="in"><a class="marca" href="#/"><i></i>Neto <small>PARCEIROS</small></a>' +
      (sessao ? '<a class="btn claro peq" href="#/painel">Meu painel</a>' : '<a class="btn claro peq" href="#/entrar">Entrar</a>') +
      '</div></header><main class="pub-main">' + conteudo + "</main>" + rodape() + "</div>";
  }
  function rodape() {
    return '<footer class="rod">Neto · CNPJ 62.317.650/0001-12 · Guarulhos/SP · Atendimento exclusivo. Atenção individual para cada operação.</footer>';
  }
  function telaInicio() {
    app.innerHTML =
      '<div class="pub"><header class="pub-top"><div class="in"><a class="marca" href="#/"><i></i>Neto <small>PARCEIROS</small></a><a class="btn claro peq" href="#/' + (sessao ? "painel" : "entrar") + '">' + (sessao ? "Meu painel" : "Entrar") + "</a></div></header>" +
      '<section class="hero"><img class="logo" src="logo.png" alt="Neto"><h1>Neto Parceiros</h1><p>O painel dos home cares, clínicas e prefeituras que acompanham os idosos pelo Neto: pacientes, alertas de dose esquecida, relatórios e repasse, num só lugar.</p>' +
      '<div class="acoes"><a class="btn ouro" href="#/cadastro">Cadastrar minha empresa ou órgão</a><a class="btn claro" href="#/entrar">Já tenho conta</a><a class="btn claro" href="#/equipe">Sou da equipe</a></div></section>' +
      '<div class="passos3"><div><b>1. Cadastro</b><span>CNPJ, responsável e documento. O Neto confere e aprova.</span></div><div><b>2. Código</b><span>As famílias digitam o seu código no app e autorizam o compartilhamento.</span></div><div><b>3. Painel</b><span>Sua equipe vê os pacientes, recebe os alertas e o relatório do mês.</span></div></div>' +
      rodape() + "</div>";
  }
  function telaEntrar(proxima) {
    pub('<div class="caixa"><h1>Entrar</h1><form id="f" novalidate>' +
      '<div class="campo"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username" required></div>' +
      '<div class="campo"><label for="se">Senha</label><input id="se" type="password" autocomplete="current-password" required></div>' +
      '<div id="msg"></div><button class="btn" type="submit">Entrar</button> <button type="button" class="link" id="esq">Esqueci minha senha</button></form>' +
      '<p style="margin-top:20px">Ainda não tem cadastro? <a href="#/cadastro">Cadastrar empresa ou órgão</a> · <a href="#/equipe">Sou da equipe</a></p></div>');
    $("#esq").onclick = function () { ir("esqueci"); };
    $("#f").onsubmit = function (e) {
      e.preventDefault();
      var b = $("button[type=submit]"); b.disabled = true; $("#msg").innerHTML = "";
      entrar($("#em").value.trim().toLowerCase(), $("#se").value).then(function () { ir(proxima || "painel"); },
        function (er) { b.disabled = false; $("#msg").innerHTML = '<div class="erro">' + esc(er.message) + "</div>"; });
    };
  }
  function telaEsqueci() {
    pub('<div class="caixa"><h1>Trocar a senha</h1><p>Enviamos um código para o seu e-mail.</p><form id="f1" novalidate>' +
      '<div class="campo"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username"></div><button class="btn" type="submit">Enviar código</button></form>' +
      '<form id="f2" novalidate hidden style="margin-top:20px"><div class="campo"><label for="co">Código recebido</label><input id="co" inputmode="numeric" autocomplete="one-time-code"></div>' +
      '<div class="campo"><label for="ns">Nova senha</label><input id="ns" type="password" autocomplete="new-password"><small>Pelo menos 8 caracteres, com letras e números.</small></div>' +
      '<button class="btn" type="submit">Trocar senha</button></form><div id="msg"></div></div>');
    $("#f1").onsubmit = function (e) {
      e.preventDefault();
      rpc("request_password_code", { _email: $("#em").value.trim().toLowerCase() }).then(function () {
        $("#f2").hidden = false; $("#msg").innerHTML = '<div class="okmsg">Se o e-mail tiver conta, o código chega em instantes.</div>';
      }, function (er) { $("#msg").innerHTML = '<div class="erro">' + esc(er.message) + "</div>"; });
    };
    $("#f2").onsubmit = function (e) {
      e.preventDefault();
      rpc("reset_password_with_code", { _email: $("#em").value.trim().toLowerCase(), _code: $("#co").value, _password: $("#ns").value }).then(function (ok) {
        $("#msg").innerHTML = ok ? '<div class="okmsg">Senha trocada. Agora é só entrar.</div>' : '<div class="erro">Código errado. Confira e tente de novo.</div>';
        if (ok) setTimeout(function () { ir("entrar"); }, 1500);
      }, function (er) { $("#msg").innerHTML = '<div class="erro">' + esc(er.message) + "</div>"; });
    };
  }
  function formConta(titulo, texto) {
    return '<h1>' + titulo + '</h1><p>' + texto + '</p><form id="fc" novalidate>' +
      '<div class="campo"><label for="nm">Seu nome completo</label><input id="nm" autocomplete="name"></div>' +
      '<div class="campo"><label for="em">E-mail</label><input id="em" type="email" autocomplete="username"></div>' +
      '<div class="grade2"><div class="campo"><label for="s1">Senha</label><input id="s1" type="password" autocomplete="new-password"><small>8 ou mais caracteres, com letras e números.</small></div>' +
      '<div class="campo"><label for="s2">Repita a senha</label><input id="s2" type="password" autocomplete="new-password"></div></div>' +
      '<label class="chk"><input type="checkbox" id="ac"><span>Li e aceito a <a href="' + PRIVACIDADE + '" target="_blank" rel="noopener noreferrer">política de privacidade</a> do Neto.</span></label>' +
      '<div id="msg"></div><button class="btn" type="submit">Criar conta e continuar</button></form>' +
      '<p style="margin-top:18px">Já tem conta? <button type="button" class="link" id="jaconta">Entrar</button></p>';
  }
  function ligarConta(depois) {
    $("#jaconta").onclick = function () { telaEntrar(rotaAtual()); };
    $("#fc").onsubmit = function (e) {
      e.preventDefault();
      var nm = $("#nm").value.trim(), em = $("#em").value.trim().toLowerCase(), s1 = $("#s1").value, s2 = $("#s2").value, msg = $("#msg");
      var erro = nm.split(/\s+/).length < 2 ? "Escreva o nome e o sobrenome." :
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) ? "Confira o e-mail." :
        (s1.length < 8 || !/[A-Za-z]/.test(s1) || !/\d/.test(s1)) ? "A senha precisa ter 8 ou mais caracteres, com letras e números." :
        s1 !== s2 ? "As duas senhas estão diferentes." : !$("#ac").checked ? "Para continuar, aceite a política de privacidade." : "";
      if (erro) { msg.innerHTML = '<div class="erro">' + esc(erro) + "</div>"; return; }
      var b = $("#fc button[type=submit]"); b.disabled = true;
      criarConta(nm, em, s1).then(function (logado) {
        if (logado) depois();
        else { b.disabled = false; msg.innerHTML = '<div class="okmsg">Conta criada. Abra o e-mail que enviamos para confirmar e depois entre.</div>'; }
      }, function (er) { b.disabled = false; msg.innerHTML = '<div class="erro">' + esc(er.message) + "</div>"; });
    };
  }

  /* cadastro da empresa/órgão */
  function telaCadastro() {
    if (!sessao) {
      pub('<div class="caixa">' + formConta("Cadastro de parceiro", "Passo 1 de 2: crie a conta do responsável. Depois você preenche os dados da empresa ou do órgão.") + "</div>");
      return ligarConta(telaCadastro);
    }
    rpc("my_org").then(function (o) {
      if (o && o.status !== "recusado") return ir("painel");
      if (o && o.papel === "equipe") return ir("painel");
      formOrg(o);
    }, function (er) { pub('<div class="caixa"><div class="erro">' + esc(er.message) + "</div></div>"); });
  }
  function formOrg(antes) {
    var t = (antes && antes.tipo) || "home_care";
    pub('<div class="caixa larga"><h1>Dados da empresa ou do órgão</h1><p>Passo 2 de 2. O Neto confere os documentos e aprova em até 2 dias úteis.</p>' +
      (antes && antes.motivo_recusa ? '<div class="erro">Cadastro recusado: ' + esc(antes.motivo_recusa) + "<br>Corrija e envie de novo (os documentos precisam ser enviados outra vez).</div>" : "") +
      '<div class="tipos" role="group" aria-label="Tipo"><button type="button" class="tipo" data-t="home_care">Home care</button><button type="button" class="tipo" data-t="clinica">Clínica</button><button type="button" class="tipo" data-t="prefeitura">Prefeitura</button></div>' +
      '<div id="aviso-pref" class="nota" hidden>Prefeituras não recebem repasse: contratam as licenças e o idoso usa de graça.</div>' +
      '<form id="fo" novalidate>' +
      '<div class="grade2"><div class="campo"><label for="lg" id="l-lg">Razão social</label><input id="lg"></div>' +
      '<div class="campo"><label for="tr" id="l-tr">Nome fantasia</label><input id="tr"></div>' +
      '<div class="campo"><label for="cn" id="l-cn">CNPJ</label><input id="cn" inputmode="numeric" placeholder="00.000.000/0000-00"><span id="v-cn"></span></div>' +
      '<div class="campo"><label for="rn" id="l-rn">Responsável (dono)</label><input id="rn" autocomplete="name"></div>' +
      '<div class="campo"><label for="cp" id="l-cp">CPF do responsável</label><input id="cp" inputmode="numeric" placeholder="000.000.000-00"><span id="v-cp"></span></div>' +
      '<div class="campo" id="c-cg" hidden><label for="cg">Cargo do servidor</label><input id="cg" placeholder="Ex.: Secretário(a) de Saúde"></div>' +
      '<div class="campo"><label for="tl">Telefone</label><input id="tl" inputmode="tel" autocomplete="tel"></div>' +
      '<div class="campo"><label for="ml">E-mail de contato</label><input id="ml" type="email"></div>' +
      '<div class="campo"><label for="cd">Cidade</label><input id="cd"></div>' +
      '<div class="campo"><label for="uf">UF</label><input id="uf" maxlength="2" placeholder="SP"></div></div>' +
      '<div class="grade2"><div class="campo"><label for="d1" id="l-d1">Documento do responsável (RG ou CNH)</label><div class="arquivo"><input id="d1" type="file" accept="image/jpeg,image/png,application/pdf"></div><small>JPG, PNG ou PDF, até 8 MB.</small></div>' +
      '<div class="campo"><label for="d2" id="l-d2">Cartão CNPJ (opcional)</label><div class="arquivo"><input id="d2" type="file" accept="image/jpeg,image/png,application/pdf"></div></div></div>' +
      '<label class="chk" id="c-pix"><input type="checkbox" id="px"><span>O repasse será pago por Pix na <b>chave CNPJ da empresa</b>.</span></label>' +
      '<label class="chk" id="c-dec" hidden><input type="checkbox" id="dc"><span>Declaro que represento o órgão e posso firmar a parceria.</span></label>' +
      '<div id="msg"></div><button class="btn ouro" type="submit">Enviar para análise</button></form></div>');
    mascara($("#cn"), "cnpj"); mascara($("#cp"), "cpf");
    function verif(id, fn, alvo) {
      $(id).addEventListener("input", function () {
        var v = $(id).value, n = so(v).length, ok = fn(v);
        $(alvo).innerHTML = (n === (id === "#cn" ? 14 : 11)) ? (ok ? '<span class="ok">✓ válido</span>' : '<span class="nok">Número inválido</span>') : "";
      });
    }
    verif("#cn", cnpjValido, "#v-cn"); verif("#cp", cpfValido, "#v-cp");
    function tipo(novo) {
      t = novo;
      $$(".tipo").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-t") === t ? "true" : "false"); });
      var p = t === "prefeitura";
      $("#aviso-pref").hidden = !p; $("#c-cg").hidden = !p; $("#c-pix").hidden = p; $("#c-dec").hidden = !p;
      $("#l-lg").textContent = p ? "Órgão (ex.: Secretaria Municipal de Saúde)" : "Razão social";
      $("#l-tr").textContent = p ? "Nome curto (ex.: Saúde de Vila Serena)" : "Nome fantasia";
      $("#l-cn").textContent = p ? "CNPJ do órgão" : "CNPJ";
      $("#l-rn").textContent = p ? "Servidor responsável" : "Responsável (dono)";
      $("#l-cp").textContent = p ? "CPF do servidor" : "CPF do responsável";
      $("#l-d1").textContent = p ? "Documento do servidor (RG ou CNH)" : "Documento do responsável (RG ou CNH)";
      $("#l-d2").textContent = p ? "Portaria ou ato de nomeação (obrigatório)" : "Cartão CNPJ (opcional)";
    }
    $$(".tipo").forEach(function (b) { b.onclick = function () { tipo(b.getAttribute("data-t")); }; });
    tipo(t);
    if (antes) {
      $("#lg").value = antes.razao_social || ""; $("#tr").value = antes.nome_fantasia || ""; $("#cn").value = fmtCnpj(antes.cnpj);
      $("#rn").value = antes.responsavel || ""; $("#cg").value = antes.cargo || ""; $("#tl").value = antes.telefone || "";
      $("#ml").value = antes.email || ""; $("#cd").value = antes.cidade || ""; $("#uf").value = antes.estado || "";
    }
    $("#fo").onsubmit = function (e) {
      e.preventDefault();
      var p = t === "prefeitura", msg = $("#msg");
      var erro = $("#lg").value.trim().length < 2 ? "Preencha " + (p ? "o nome do órgão." : "a razão social.") :
        !cnpjValido($("#cn").value) ? "Confira o CNPJ." :
        $("#rn").value.trim().split(/\s+/).length < 2 ? "Escreva o nome completo do responsável." :
        !cpfValido($("#cp").value) ? "Confira o CPF." :
        (p && $("#cg").value.trim().length < 3) ? "Informe o cargo do servidor." :
        !$("#d1").files[0] ? "Envie a foto do documento do responsável." :
        (p && !$("#d2").files[0]) ? "Envie a portaria ou ato de nomeação." :
        (!p && !$("#px").checked) ? "Confirme o Pix na chave CNPJ da empresa." :
        (p && !$("#dc").checked) ? "Confirme a declaração de que representa o órgão." :
        ($("#uf").value && !/^[A-Za-z]{2}$/.test($("#uf").value.trim())) ? "UF: use a sigla, por exemplo SP." : "";
      if (erro) { msg.innerHTML = '<div class="erro">' + esc(erro) + "</div>"; return; }
      var b = $("#fo button[type=submit]"); b.disabled = true; b.textContent = "Enviando documentos…"; msg.innerHTML = "";
      var c1, c2;
      enviarDocumento($("#d1").files[0]).then(function (x) { c1 = x; return enviarDocumento($("#d2").files[0]); })
        .then(function (x) {
          c2 = x; b.textContent = "Enviando cadastro…";
          return rpc("org_submit", {
            _kind: t, _legal: $("#lg").value.trim(), _trade: $("#tr").value.trim(), _cnpj: so($("#cn").value),
            _resp_name: $("#rn").value.trim(), _resp_cpf: so($("#cp").value), _resp_role: p ? $("#cg").value.trim() : null,
            _doc_path: c1, _extra_path: c2, _phone: $("#tl").value.trim(), _email: $("#ml").value.trim(),
            _city: $("#cd").value.trim(), _state: $("#uf").value.trim().toUpperCase(), _pix_ok: !p && $("#px").checked
          });
        })
        .then(function () { aviso("Cadastro enviado!"); ir("painel"); },
          function (er) { b.disabled = false; b.textContent = "Enviar para análise"; msg.innerHTML = '<div class="erro">' + esc(er.message) + "</div>"; });
    };
  }

  /* equipe */
  function telaEntrarEquipe() {
    if (!sessao) {
      pub('<div class="caixa">' + formConta("Entrar na equipe", "Para funcionários do home care, da clínica ou da Secretaria. Crie a sua conta; depois digite o código da equipe que o responsável passou.") + "</div>");
      return ligarConta(telaEntrarEquipe);
    }
    rpc("my_org").then(function (o) {
      if (o) return ir("painel");
      pub('<div class="caixa"><h1>Código da equipe</h1><p>Peça o código ao responsável pela empresa ou pelo órgão.</p><form id="fe" novalidate>' +
        '<div class="campo"><label for="tc">Código da equipe</label><input id="tc" autocomplete="off" maxlength="20" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700"></div>' +
        '<div id="msg"></div><button class="btn" type="submit">Entrar na equipe</button></form></div>');
      $("#fe").onsubmit = function (e) {
        e.preventDefault();
        var b = $("#fe button"); b.disabled = true;
        rpc("org_join_team", { _code: $("#tc").value.trim().toUpperCase() }).then(function (nome) {
          if (!nome) { b.disabled = false; $("#msg").innerHTML = '<div class="erro">Código não encontrado. Confira com o responsável.</div>'; return; }
          aviso("Pedido enviado para " + nome + "."); ir("painel");
        }, function (er) { b.disabled = false; $("#msg").innerHTML = '<div class="erro">' + esc(er.message) + "</div>"; });
      };
    });
  }

  /* ---------------- painel ---------------- */
  function painel(sub) {
    if (!sessao) return telaEntrar("painel" + (sub.length ? "/" + sub.join("/") : ""));
    app.innerHTML = '<div class="carregando">Carregando o painel…</div>';
    rpc("my_org").then(function (o) {
      org = o;
      if (!o) return ir("cadastro");
      if (o.status === "pendente") return msgTela("⏳", "Cadastro em análise", "O Neto está conferindo os documentos de " + esc(o.nome_fantasia || o.razao_social) + ". Isso leva até 2 dias úteis. Você recebe a resposta aqui mesmo.");
      if (o.status === "recusado") return o.papel === "dono" ? formOrg(o) : msgTela("⚠️", "Cadastro recusado", "Fale com o responsável pela empresa.");
      if (o.status === "suspenso") return msgTela("⛔", "Acesso suspenso", (o.motivo_recusa ? esc(o.motivo_recusa) + "<br>" : "") + "Fale com o Neto: " + esc(CONTATO));
      if (o.membro_status !== "ativo") return msgTela("⏳", "Aguardando aprovação", "Seu pedido para entrar na equipe de " + esc(o.nome_fantasia || o.razao_social) + " foi enviado. O responsável precisa aprovar.");
      var pref = o.tipo === "prefeitura", dono = o.papel === "dono";
      var menu = [["pacientes", pref ? "Idosos" : "Pacientes"]];
      if (dono && pref) menu.push(["indicadores", "Indicadores"]);
      if (dono) menu.push(["equipe", "Equipe"]);
      if (dono && !pref) menu.push(["repasse", "Repasse"]);
      if (dono && pref) menu.push(["licencas", "Licenças"]);
      menu.push(["cadastro", "Cadastro"]);
      var atual = sub[0] || "pacientes";
      if (!menu.some(function (m) { return m[0] === atual; }) && atual !== "paciente") atual = "pacientes";
      app.innerHTML = '<div class="pn"><aside class="lado"><a class="marca" href="#/painel"><i></i>Neto <small>PARCEIROS</small></a><div class="org">' + esc(o.nome_fantasia || o.razao_social) + "</div><nav>" +
        menu.map(function (m) { return '<a href="#/painel/' + m[0] + '"' + ((m[0] === atual || (atual === "paciente" && m[0] === "pacientes")) ? ' aria-current="page"' : "") + ">" + m[1] + "</a>"; }).join("") +
        '</nav><button class="btn claro peq sair" id="sair">Sair</button></aside><main class="conteudo" id="c"><div class="carregando">Carregando…</div></main></div>';
      $("#sair").onclick = function () { sair(false); };
      var c = $("#c");
      if (atual === "pacientes") return pPacientes(c, pref);
      if (atual === "paciente") return pPaciente(c, sub[1], pref);
      if (atual === "equipe") return pEquipe(c, pref);
      if (atual === "repasse") return pRepasse(c);
      if (atual === "indicadores") return pIndicadores(c);
      if (atual === "licencas") return pLicencas(c);
      if (atual === "cadastro") return pCadastro(c);
    }, function (er) {
      if (!sessao) return;
      msgTela("⚠️", "Não foi possível abrir o painel", esc(er.message));
    });
  }
  function msgTela(ic, tit, txt) {
    pub('<div class="caixa tela-msg"><div class="ic">' + ic + "</div><h1>" + esc(tit) + "</h1><p>" + txt + '</p><button class="btn linha" id="sair2">Sair</button></div>');
    $("#sair2").onclick = function () { sair(false); };
  }
  function falha(c, er) { c.innerHTML = '<div class="erro">' + esc(er.message) + "</div>"; }

  function pPacientes(c, pref) {
    var lista = [], filtroU = "", busca = "";
    function desenhar() {
      var unidades = []; lista.forEach(function (p) { if (p.unidade && unidades.indexOf(p.unidade) < 0) unidades.push(p.unidade); });
      unidades.sort();
      var vis = lista.filter(function (p) {
        return (!filtroU || (filtroU === "-" ? !p.unidade : p.unidade === filtroU)) && (!busca || String(p.nome).toLowerCase().indexOf(busca) >= 0);
      });
      var aten = lista.filter(function (p) { return p.esquecidas_agora > 0 || p.alertas_24h > 0; }).length;
      var dh = 0, th = 0; lista.forEach(function (p) { dh += p.doses_hoje || 0; th += Math.min(p.tomadas_hoje || 0, p.doses_hoje || 0); });
      c.innerHTML =
        '<div class="topo-pn"><h1>' + (pref ? "Idosos do programa" : "Pacientes") + ' · hoje</h1><span class="selo s-neu">Atualiza sozinho a cada minuto</span></div>' +
        (org.codigo_parceiro ? '<div class="codigo"><span>Código para as famílias:</span><strong>NETO-' + esc(org.codigo_parceiro) + '</strong><button class="btn peq" id="cp">Copiar</button><small>A família digita este código no app, em “' + (pref ? "Programa da prefeitura" : "Meu home care") + "”, e autoriza o compartilhamento.</small></div>" : "") +
        '<div class="cartoes"><div class="cartao"><b>' + lista.length + "</b><span>" + (pref ? "idosos no programa" : "pacientes ligados") + '</span></div><div class="cartao"><b style="color:var(--verde)">' + (lista.length - aten) +
        '</b><span>com tudo em dia</span></div><div class="cartao"><b style="color:var(--verm)">' + aten + '</b><span>precisam de atenção</span></div><div class="cartao"><b>' + (dh ? Math.round(100 * th / dh) + "%" : "—") + "</b><span>doses tomadas hoje</span></div></div>" +
        '<div class="filtros"><input id="bu" placeholder="Buscar pelo nome" value="' + esc(busca) + '"><select id="un"><option value="">' + (pref ? "Todas as UBS" : "Todas as unidades") + "</option>" +
        unidades.map(function (u) { return '<option value="' + esc(u) + '"' + (filtroU === u ? " selected" : "") + ">" + esc(u) + "</option>"; }).join("") + '<option value="-"' + (filtroU === "-" ? " selected" : "") + ">Sem unidade</option></select></div>" +
        (vis.length ? '<table class="tabela"><thead><tr><th>' + (pref ? "Idoso" : "Paciente") + '</th><th class="esc">' + (pref ? "UBS" : "Unidade") + '</th><th>Doses hoje</th><th>Situação</th><th class="esc">Pressão</th><th class="esc">Glicemia</th></tr></thead><tbody>' +
          vis.map(function (p) {
            var esq = p.esquecidas_agora > 0, al = p.alertas_24h > 0;
            return '<tr class="clicavel' + (esq ? " alerta" : "") + '" data-id="' + esc(p.family_id) + '"><td><span class="pc"><span class="av" style="background:' + cor(p.nome) + '">' + esc(iniciais(p.nome)) + "</span>" + esc(p.nome) + "</span></td>" +
              '<td class="esc">' + esc(p.unidade || "—") + "</td><td>" + (p.doses_hoje ? Math.min(p.tomadas_hoje, p.doses_hoje) + " de " + p.doses_hoje : "—") + "</td><td>" +
              (esq ? '<span class="dot" style="background:var(--verm)"></span><b style="color:var(--verm)">Esqueceu</b>' : al ? '<span class="dot" style="background:var(--amar)"></span>Teve alerta' : p.tem_idoso ? '<span class="dot" style="background:var(--verde)"></span>Em dia' : '<span class="selo s-neu">Sem celular do idoso</span>') + "</td>" +
              '<td class="esc ' + nivelClasse(p.pressao_nivel) + '">' + esc(p.pressao || "—") + '</td><td class="esc ' + nivelClasse(p.glicemia_nivel) + '">' + esc(p.glicemia || "—") + "</td></tr>";
          }).join("") + "</tbody></table>"
          : '<div class="vazio">' + (lista.length ? "Ninguém com esse filtro." : "Ainda não há " + (pref ? "idosos" : "pacientes") + " ligados. Passe o código acima para as famílias.") + "</div>");
      if ($("#cp")) $("#cp").onclick = function () { copiar("NETO-" + org.codigo_parceiro); };
      $("#bu").oninput = function () { busca = this.value.trim().toLowerCase(); var pos = this.selectionStart; desenhar(); var el = $("#bu"); el.focus(); el.setSelectionRange(pos, pos); };
      $("#un").onchange = function () { filtroU = this.value; desenhar(); };
      $$("tr.clicavel", c).forEach(function (tr) { tr.onclick = function () { ir("painel/paciente/" + tr.getAttribute("data-id")); }; });
    }
    function carregar() { rpc("org_patients").then(function (r) { lista = r || []; desenhar(); }, function (er) { falha(c, er); }); }
    carregar(); timers.push(setInterval(function () { if (!document.hidden) carregar(); }, 60000));
  }

  function grafico(medidas, tipo) {
    var pts = medidas.filter(function (m) { return m.tipo === tipo; }).slice().reverse();
    if (pts.length < 2) return '<div class="vazio">Poucas medidas no período.</div>';
    var W = 640, H = 200, x0 = 40, s1 = tipo === "pressao" ? "sistolica" : "glicemia";
    var vals = []; pts.forEach(function (p) { vals.push(p[s1]); if (tipo === "pressao") vals.push(p.diastolica); });
    var mn = Math.min.apply(null, vals) - 10, mx = Math.max.apply(null, vals) + 10;
    function y(v) { return H - 20 - (v - mn) / (mx - mn) * (H - 40); }
    function x(i) { return x0 + i * (W - x0 - 10) / (pts.length - 1); }
    function linha(k, corL) { return '<path d="' + pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1); }).join("") + '" fill="none" stroke="' + corL + '" stroke-width="3" stroke-linejoin="round"/>'; }
    var g = "";
    [mn + 10, (mn + mx) / 2, mx - 10].forEach(function (v) { g += '<line x1="' + x0 + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#efe9dd"/><text x="0" y="' + (y(v) + 4) + '" font-size="12" fill="#8a94a6">' + Math.round(v) + "</text>"; });
    g += linha(s1, "#1f6fae"); if (tipo === "pressao") g += linha("diastolica", "#e07b39");
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="Gráfico de ' + (tipo === "pressao" ? "pressão" : "glicemia") + '">' + g + "</svg>" +
      (tipo === "pressao" ? '<small><span style="color:#1f6fae">■</span> máxima &nbsp; <span style="color:#e07b39">■</span> mínima</small>' : "");
  }
  function pPaciente(c, id, pref) {
    var dias = 30;
    function carregar() {
      c.innerHTML = '<div class="carregando">Carregando o relatório…</div>';
      rpc("org_patient_report", { _family: id, _days: dias }).then(function (r) {
        var p = r.paciente || {}, d = r.doses || {}, tot = (d.tomadas || 0) + (d.esquecidas || 0), pct = tot ? Math.round(100 * d.tomadas / tot) : null;
        var circ = 2 * Math.PI * 70, off = circ * (1 - (pct || 0) / 100);
        var med = r.medidas || [];
        var unidadeAtual = "";
        c.innerHTML =
          '<p class="nao-imprime"><a href="#/painel/pacientes">← Voltar</a></p><div class="topo-pn"><h1>' + esc(p.nome) + '</h1><div class="nao-imprime"><select id="di"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select> <button class="btn peq linha" id="pr">Imprimir</button></div></div>' +
          "<p>" + esc([idade(p.nascimento), p.tipo_sanguineo ? "Tipo sanguíneo " + p.tipo_sanguineo : ""].filter(Boolean).join(" · ")) + "</p>" +
          '<div class="rel"><div><div class="bloco" style="text-align:center"><div class="tt">Doses tomadas · ' + r.dias + ' dias</div><svg width="180" height="180" viewBox="0 0 180 180"><circle cx="90" cy="90" r="70" fill="none" stroke="#efe9dd" stroke-width="18"/>' +
          (pct !== null ? '<circle cx="90" cy="90" r="70" fill="none" stroke="' + (pct >= 80 ? "#1f8a4c" : pct >= 60 ? "#c88a12" : "#c0392b") + '" stroke-width="18" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 90 90)"/>' : "") +
          '<text x="90" y="102" text-anchor="middle" font-size="36" font-weight="700" fill="#16233a">' + (pct === null ? "—" : pct + "%") + '</text></svg><div>' + (d.tomadas || 0) + " tomadas · " + (d.esquecidas || 0) + " esquecidas</div></div>" +
          '<div class="bloco"><div class="tt">Alergias</div>' + ((p.alergias || []).length ? '<ul class="lista">' + p.alergias.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "Nenhuma informada.") +
          '<div class="tt" style="margin-top:12px">Condições</div>' + ((p.condicoes || []).length ? '<ul class="lista">' + p.condicoes.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ul>" : "Nenhuma informada.") + "</div>" +
          '<div class="bloco nao-imprime"><div class="tt">' + (pref ? "UBS" : "Unidade") + '</div><div class="filtros" style="margin:0"><input id="ud" placeholder="' + (pref ? "Ex.: UBS Centro" : "Ex.: Filial Norte") + '" maxlength="60"><button class="btn peq" id="us">Salvar</button></div></div></div>' +
          '<div><div class="bloco"><div class="tt">Pressão</div>' + grafico(med, "pressao") + '</div><div class="bloco"><div class="tt">Glicemia</div>' + grafico(med, "glicemia") + "</div>" +
          '<div class="bloco"><div class="tt">Remédios</div>' + ((r.remedios || []).length ? '<table class="tabela" style="border:0"><tbody>' + r.remedios.map(function (m) { return "<tr><td><b>" + esc(m.nome) + "</b> " + esc(m.dose || "") + "</td><td>" + (m.se_precisar ? "Se precisar" : esc(m.horario)) + "</td></tr>"; }).join("") + "</tbody></table>" : "Nenhum remédio ativo.") + "</div>" +
          '<div class="bloco"><div class="tt">Últimos alertas</div>' + ((r.alertas || []).length ? '<ul class="lista">' + r.alertas.slice(0, 10).map(function (a) { return "<li><b>" + esc(a.titulo || "Alerta") + "</b> — " + esc(a.mensagem || "") + ' <small style="color:var(--suave)">' + esc(dataHora(a.em)) + "</small></li>"; }).join("") + "</ul>" : "Nenhum alerta no período.") + "</div></div></div>" +
          '<p style="color:var(--suave);font-size:.9rem">🔒 Este acesso fica registrado para a família.</p>';
        $("#di").value = String(dias);
        $("#di").onchange = function () { dias = +this.value; carregar(); };
        $("#pr").onclick = function () { window.print(); };
        rpc("org_patients").then(function (l) { (l || []).forEach(function (x) { if (x.family_id === id) unidadeAtual = x.unidade || ""; }); if ($("#ud")) $("#ud").value = unidadeAtual; });
        $("#us").onclick = function () { rpc("org_set_unit", { _family: id, _unit: $("#ud").value.trim() }).then(function () { aviso("Unidade salva."); }, function (er) { aviso(er.message); }); };
      }, function (er) { falha(c, er); });
    }
    carregar();
  }

  function pEquipe(c, pref) {
    var mostrar = false;
    function carregar() {
      rpc("org_team").then(function (t) {
        t = t || [];
        c.innerHTML = '<h1>Equipe</h1><div class="codigo"><span>Código da equipe (secreto):</span><strong>' + (mostrar ? esc(org.codigo_equipe) : "••••••••••••") +
          '</strong><button class="btn peq linha" id="ve">' + (mostrar ? "Esconder" : "Mostrar") + '</button><button class="btn peq" id="ce">Copiar</button><small>Passe só para quem trabalha com você. A pessoa entra em “Sou da equipe” e você aprova aqui. Se o código vazar, peça um novo ao Neto.</small></div>' +
          '<table class="tabela"><thead><tr><th>Nome</th><th class="esc">E-mail</th><th>' + (pref ? "UBS" : "Unidade") + "</th><th>Situação</th><th></th></tr></thead><tbody>" +
          t.map(function (m) {
            var dono = m.papel === "dono";
            return "<tr><td><b>" + esc(m.nome || "—") + "</b><br><small>" + (dono ? "Responsável" : "Equipe") + '</small></td><td class="esc">' + esc(m.email) + "</td>" +
              "<td>" + (dono ? "—" : '<input class="un" data-u="' + esc(m.user_id) + '" value="' + esc(m.unidade || "") + '" maxlength="60" style="height:38px;border:2px solid var(--linha);border-radius:10px;padding:0 8px;width:150px">') + "</td>" +
              "<td>" + (m.status === "ativo" ? '<span class="selo s-ok">Ativo</span>' : '<span class="selo s-esp">Aguardando</span>') + "</td><td>" +
              (dono ? "" : (m.status !== "ativo" ? '<button class="btn peq verde" data-a="aprovar" data-u="' + esc(m.user_id) + '">Aprovar</button> ' : "") + '<button class="btn peq perigo" data-a="remover" data-u="' + esc(m.user_id) + '">Remover</button>') + "</td></tr>";
          }).join("") + "</tbody></table>" +
          '<p style="color:var(--suave)">A equipe vê os ' + (pref ? "idosos" : "pacientes") + " e os alertas. Só o responsável vê " + (pref ? "os indicadores e as licenças" : "o repasse") + " e muda a equipe.</p>";
        $("#ve").onclick = function () { mostrar = !mostrar; carregar(); };
        $("#ce").onclick = function () { copiar(org.codigo_equipe || ""); };
        $$("button[data-a]", c).forEach(function (b) {
          b.onclick = function () {
            var a = b.getAttribute("data-a");
            if (a === "remover" && !confirmarInline(b)) return;
            rpc("org_member_set", { _user: b.getAttribute("data-u"), _action: a }).then(function () { aviso(a === "aprovar" ? "Aprovado." : "Removido."); carregar(); }, function (er) { aviso(er.message); });
          };
        });
        $$("input.un", c).forEach(function (i) {
          i.onchange = function () { rpc("org_member_unit", { _user: i.getAttribute("data-u"), _unit: i.value.trim() }).then(function () { aviso("Unidade salva."); }, function (er) { aviso(er.message); }); };
        });
      }, function (er) { falha(c, er); });
    }
    carregar();
  }
  function confirmarInline(b) {
    if (b.getAttribute("data-conf")) return true;
    b.setAttribute("data-conf", "1"); b.textContent = "Confirmar remoção";
    setTimeout(function () { if (b.isConnected) { b.removeAttribute("data-conf"); b.textContent = "Remover"; } }, 4000);
    return false;
  }

  function pRepasse(c) {
    rpc("org_statements").then(function (s) {
      s = s || [];
      var u = s[0];
      var st = { a_pagar: '<span class="selo s-esp">A pagar</span>', pago: '<span class="selo s-ok">Pago</span>', sem_valor: '<span class="selo s-neu">Sem valor</span>' };
      c.innerHTML = "<h1>Repasse</h1>" +
        (u ? '<div class="verde-box"><div><div>' + esc(nomeMes(u.mes)) + " · " + u.familias + " famílias × " + brl(u.valor_unitario) + "</div><b>" + brl(u.valor, true) + '</b></div><div style="text-align:right">' + (u.status === "pago" ? "✓ Pago por Pix em " + esc(dataBr(u.pago_em)) : u.status === "a_pagar" ? "Pagamento em andamento" : "Sem famílias pagantes no mês") + "<br><small>Pix na chave CNPJ " + esc(fmtCnpj(org.cnpj)) + "</small></div></div>" : "") +
        (s.length ? '<table class="tabela"><thead><tr><th>Mês</th><th>Famílias</th><th class="esc">Por família</th><th>Valor</th><th>Situação</th><th class="esc">Comprovante</th></tr></thead><tbody>' +
          s.map(function (x) { return "<tr><td>" + esc(nomeMes(x.mes)) + "</td><td>" + x.familias + '</td><td class="esc">' + brl(x.valor_unitario) + "</td><td><b>" + brl(x.valor, true) + "</b></td><td>" + (st[x.status] || esc(x.status)) + (x.pago_em ? " " + esc(dataBr(x.pago_em)) : "") + '</td><td class="esc">' + esc(x.comprovante || "") + "</td></tr>"; }).join("") + "</tbody></table>"
          : '<div class="vazio">O primeiro fechamento aparece aqui no dia 1º do próximo mês.</div>') +
        '<p style="color:var(--suave)">Todo dia 1º o Neto fecha o mês anterior. Conta só as famílias ligadas a você que pagaram a assinatura. O pagamento é por Pix na chave CNPJ da empresa.</p>';
    }, function (er) { falha(c, er); });
  }

  function pIndicadores(c) {
    var hoje = new Date(), opcoes = [];
    for (var i = 0; i < 12; i++) { var d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); opcoes.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01"); }
    var mes = opcoes[0];
    function carregar() {
      rpc("org_indicators", { _month: mes }).then(function (r) {
        var u = r.unidades || [];
        c.innerHTML = '<div class="topo-pn"><h1>Indicadores</h1><div class="nao-imprime"><select id="me">' + opcoes.map(function (o) { return '<option value="' + o + '">' + esc(nomeMes(o)) + "</option>"; }).join("") + '</select> <button class="btn peq linha" id="pr">Imprimir / salvar PDF</button></div></div>' +
          '<p class="so-impressao"><b>' + esc(org.razao_social) + "</b> · " + esc(nomeMes(r.mes)) + "</p>" +
          '<div class="cartoes"><div class="cartao"><b>' + Number(r.pacientes || 0).toLocaleString("pt-BR") + '</b><span>idosos no programa</span></div><div class="cartao"><b style="color:var(--verde)">' + (r.doses_tomadas_pct == null ? "—" : r.doses_tomadas_pct + "%") +
          '</b><span>doses tomadas no mês</span></div><div class="cartao"><b>' + (r.pressao_controlada_pct == null ? "—" : r.pressao_controlada_pct + "%") + '</b><span>pressão controlada (média abaixo de 14/9)</span></div><div class="cartao"><b>' + Number(r.pressao_medida || 0).toLocaleString("pt-BR") + "</b><span>idosos que mediram a pressão</span></div></div>" +
          '<div class="bloco"><div class="tt">Por UBS</div>' + (u.length ? '<table class="tabela" style="border:0"><thead><tr><th>UBS</th><th>Idosos</th><th>Doses tomadas</th><th class="esc"></th></tr></thead><tbody>' +
            u.map(function (x) { var p = x.doses_tomadas_pct; return "<tr><td><b>" + esc(x.unidade) + "</b></td><td>" + x.pacientes + "</td><td>" + (p == null ? "—" : p + "%") + '</td><td class="esc"><div class="barra"><i style="width:' + (p || 0) + "%;background:" + (p >= 85 ? "#1f8a4c" : p >= 70 ? "#c88a12" : "#c0392b") + '"></i></div></td></tr>'; }).join("") + "</tbody></table>" : "Sem dados no mês.") + "</div>" +
          '<p style="color:var(--suave)">🔒 Indicadores somados: sem expor dados de cada pessoa. Para separar por UBS, defina a UBS de cada idoso na tela do idoso.</p>';
        $("#me").value = mes; $("#me").onchange = function () { mes = this.value; carregar(); };
        $("#pr").onclick = function () { window.print(); };
      }, function (er) { falha(c, er); });
    }
    carregar();
  }
  function pLicencas(c) {
    c.innerHTML = '<h1>Licenças do programa</h1><div class="verde-box" style="background:linear-gradient(160deg,#1f4f8a,#16386a)"><div><div>Idosos ativos no programa</div><b>' + (org.familias_vinculadas || 0) + "</b></div></div>" +
      '<div class="bloco">Contrato, notas fiscais e relatórios mensais aparecem aqui. Para ajustar o número de licenças, fale com o Neto: <b>' + esc(CONTATO) + "</b>.</div>" +
      '<p style="color:var(--suave)">Prefeituras não recebem repasse e não pagam comissão: contratam só as licenças.</p>';
  }
  function pCadastro(c) {
    var o = org, pref = o.tipo === "prefeitura";
    var tipos = { home_care: "Home care", clinica: "Clínica", prefeitura: "Prefeitura" };
    function l(k, v) { return v ? "<tr><td>" + k + "</td><td><b>" + esc(v) + "</b></td></tr>" : ""; }
    c.innerHTML = '<h1>Cadastro</h1><table class="tabela"><tbody>' + l("Tipo", tipos[o.tipo]) + l(pref ? "Órgão" : "Razão social", o.razao_social) + l("Nome", o.nome_fantasia) + l("CNPJ", fmtCnpj(o.cnpj)) +
      l(pref ? "Servidor responsável" : "Responsável", o.responsavel) + l("CPF", o.cpf_final ? "***.***.***-" + o.cpf_final : "") + l("Cargo", o.cargo) + l("Telefone", o.telefone) + l("E-mail", o.email) +
      l("Cidade", [o.cidade, o.estado].filter(Boolean).join(" / ")) + l("Seu papel", o.papel === "dono" ? "Responsável" : "Equipe") + l(pref ? "Repasse" : "Repasse por família", pref ? "Não se aplica" : brl(o.repasse_valor) + " por mês") + "</tbody></table>" +
      '<p style="color:var(--suave)">Para mudar estes dados, fale com o Neto: ' + esc(CONTATO) + '.</p><button class="btn linha" id="sx">Sair</button>';
    $("#sx").onclick = function () { sair(false); };
  }

  rotear();
})();
