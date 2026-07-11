const http = require('http');
const XLSX = require('xlsx');
const { extractProperty } = require('./services/extratorcorreto-ajustado');

let status = 'idle';
let progresso = [];
let resultadoFinal = null;
let rowsGlobal = [];

async function rodarExtracao() {
  status = 'rodando'; progresso = []; resultadoFinal = null;
  const resultado = [];

  for (let i = 0; i < rowsGlobal.length; i++) {
    const r = rowsGlobal[i];
    const url = (r['Url anúncio'] || r['url'] || '').toString().trim();
    const nome = (r['Nome'] || '').toString().trim();

    progresso.push({ i: i+1, total: rowsGlobal.length, nome, status: 'extraindo', url });
    console.log(`[${i+1}/${rowsGlobal.length}] ${nome}...`);

    let ex = {};
    if (url && url.includes('imovelweb')) {
      ex = await extractProperty({ url }, {});
      const _pausa = 2000 + Math.floor(Math.random() * 3000);
      await new Promise(r => setTimeout(r, _pausa));
    }

    if (ex.indisponivel || ex.extractionStatus === 'indisponivel') {
      progresso[i].status = 'indisponivel';
      console.log('  ❌ indisponível');
      continue;
    }
    if (ex.extractionStatus === 'erro') {
      progresso[i].status = 'erro';
      console.log('  ⚠️ erro:', ex.error);
    } else {
      progresso[i].status = 'ok';
      progresso[i].quartos = ex.quartos;
      progresso[i].area = ex.area_m2;
      progresso[i].bairro = ex.bairro || '';
      progresso[i].cidade = ex.cidade || '';
      progresso[i].valor = ex.valor_imovel || 0;
      console.log('  ✅ q:'+ex.quartos+' area:'+ex.area_m2+'m² bairro:'+(ex.bairro||'-'));
    }

    const tel = (r['Telefone'] || '').toString().replace(/\D/g,'');
    const valor = (r['Preço'] || ex.valor_imovel || '').toString().replace(/R\$/g,'').replace(/\./g,'').replace(',','.').trim();
    const valorNum = parseFloat(valor);
    const transacao = (r['Tipo de operação'] || '').toString().toLowerCase().includes('venda') ? 'compra' : 'aluguel';
    const tipo = (ex.tipo || r['Tipo de imóvel'] || '').toString().toLowerCase().trim();

    resultado.push({
      Nome: nome,
      Telefone: tel,
      Email: (r['E-mail usuário'] || r['Email'] || '').toString().trim(),
      Origem: 'imovelweb',
      Tipo: tipo,
      Transacao: transacao,
      Condicao: '',
      Bairro: ex.bairro || (r['Bairro'] || '').toString().trim(),
      Cidade: ex.cidade || (r['Cidade'] || '').toString().trim(),
      Estado: ex.estado || (r['Estado'] || '').toString().trim(),
      Quartos: ex.quartos || '',
      Suites: ex.suites || '',
      Vagas: ex.vagas || '',
      Banheiros: ex.banheiros || '',
      Area_min: ex.area_m2 || '',
      Area_max: '',
      Valor_min: '',
      Valor_max: isNaN(valorNum) ? '' : Math.round(valorNum).toString(),
      Observacoes: url
    });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado), 'Leads');
  resultadoFinal = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  status = 'concluido';
  console.log('\n✅ Concluído —', resultado.length, 'leads gerados');
}

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Extrator de Leads ImovelWeb</title>
<style>
body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#f9fafb}
h1{font-size:20px;font-weight:800;margin-bottom:4px}
.sub{color:#888;font-size:13px;margin-bottom:20px}
.upload{border:2px dashed #e5e7eb;border-radius:12px;padding:32px;text-align:center;cursor:pointer;background:#fff;margin-bottom:16px;max-width:600px}
.upload.ok{border-color:#22c55e;background:#f0fdf4}
.btn{padding:10px 20px;border-radius:8px;border:none;font-size:13px;font-weight:700;cursor:pointer;margin-right:8px}
.btn-red{background:#FF385C;color:#fff}
.btn-green{background:#22c55e;color:#fff}
.btn:disabled{opacity:.5;cursor:not-allowed}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:16px}
.bar{background:#f3f4f6;border-radius:99px;height:8px;overflow:hidden;margin:12px 0}
.fill{height:100%;background:#FF385C;border-radius:99px;transition:width .3s}
.tbl-wrap{overflow-x:auto}
table{border-collapse:collapse;font-size:12px;white-space:nowrap;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);width:100%}
th{padding:10px 14px;background:#f9fafb;font-size:11px;color:#888;text-align:left;border-bottom:1px solid #f3f4f6}
td{padding:8px 14px;border-bottom:1px solid #f9fafb;max-width:200px;overflow:hidden;text-overflow:ellipsis}
tr:hover td{background:#fafafa}
</style>
</head>
<body>
<h1>📥 Extrator de Leads ImovelWeb</h1>
<p class="sub">Suba a planilha · visualize os dados · extraia e baixe pronta para importar</p>

<div class="upload" id="upload" onclick="document.getElementById('file').click()">
  <div style="font-size:36px">📂</div>
  <div id="upload-label" style="font-weight:600;margin-top:8px;color:#111">Clique para selecionar a planilha (.xlsx)</div>
  <div style="font-size:12px;color:#aaa;margin-top:4px">Exportada do ImovelWeb (.xlsx, .xls ou .csv)</div>
</div>
<input type="file" id="file" style="display:none" accept=".xlsx,.xls,.csv" onchange="carregar(this)">

<div id="acoes" style="display:none;margin-bottom:16px">
  <button class="btn btn-red" id="btn-extrair" onclick="extrair()">🚀 Extrair e gerar planilha</button>
  <button class="btn" id="btn-teste" onclick="extrair(30)" style="background:#f3f4f6;color:#111">🧪 Testar 30 primeiros</button>
  <span id="info" style="font-size:13px;color:#888"></span>
</div>

<div id="prog-area" style="display:none" class="card">
  <div style="display:flex;justify-content:space-between;font-size:13px">
    <span id="prog-txt">Extraindo...</span><span id="prog-pct">0%</span>
  </div>
  <div class="bar"><div class="fill" id="fill" style="width:0%"></div></div>
  <div id="prog-tabela" style="max-height:300px;overflow-y:auto;overflow-x:auto;margin-top:8px;white-space:nowrap">
    <table><thead><tr><th>#</th><th>Nome</th><th>Status</th><th>Bairro</th><th>Cidade</th><th>Quartos</th><th>Área</th><th>Valor</th></tr></thead>
    <tbody id="prog-tbody"></tbody></table>
  </div>
</div>

<div id="download-area" style="display:none;margin-bottom:16px">
  <button class="btn btn-green" onclick="baixar()">⬇️ Baixar planilha pronta</button>
</div>

<div id="conteudo" style="display:none">
  <div id="resumo" style="font-size:13px;color:#555;margin-bottom:12px;background:#fff;padding:12px 16px;border-radius:8px;display:inline-block"></div>
  <div class="tbl-wrap">
    <table id="tabela">
      <thead id="thead"></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script>
const OCULTAR = ['telefone 2','sucursal','mensagem','data','id anúncio','código'];
let arquivo = null;
let _ehCsv = false;

function carregar(input) {
  arquivo = input.files[0];
  if (!arquivo) return;
  document.getElementById('upload-label').textContent = '✅ ' + arquivo.name;
  document.getElementById('upload').classList.add('ok');
  const reader = new FileReader();
  _ehCsv = arquivo.name.toLowerCase().endsWith('.csv');
  reader.onload = function(e) {
    let wb;
    if (_ehCsv) {
      const bytes = new Uint8Array(e.target.result);
      const texto = new TextDecoder('utf-8').decode(bytes);
      wb = XLSX.read(texto, { type: 'string' });
    } else {
      const data = new Uint8Array(e.target.result);
      wb = XLSX.read(data, { type: 'array' });
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return alert('Planilha vazia');
    const cols = Object.keys(rows[0]).filter(c => !OCULTAR.includes(c.toLowerCase()));
    document.getElementById('resumo').textContent = rows.length + ' leads · ' + cols.length + ' colunas';
    document.getElementById('thead').innerHTML = '<tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr>';
    document.getElementById('tbody').innerHTML = rows.map(r =>
      '<tr>' + cols.map(c => '<td title="' + String(r[c]||'').replace(/"/g,'') + '">' + (r[c]||'') + '</td>').join('') + '</tr>'
    ).join('');
    document.getElementById('conteudo').style.display = 'block';
    document.getElementById('acoes').style.display = 'block';
    document.getElementById('info').textContent = rows.length + ' leads para extrair';
  };
  reader.readAsArrayBuffer(arquivo);
}

async function extrair(limite) {
  if (!arquivo) return;
  document.getElementById('btn-extrair').disabled = true;
  document.getElementById('btn-teste').disabled = true;
  document.getElementById('prog-area').style.display = 'block';
  document.getElementById('download-area').style.display = 'none';
  const buf = await arquivo.arrayBuffer();
  let _urlExtrair = _ehCsv ? '/extrair?csv=1' : '/extrair?x=1';
  if (limite) _urlExtrair += '&limite=' + limite;
  await fetch(_urlExtrair, { method: 'POST', body: buf, headers: { 'Content-Type': 'application/octet-stream' } });
  const poll = setInterval(async () => {
    const r = await fetch('/status');
    const d = await r.json();
    const prog = d.progresso || [];
    const total = prog.length > 0 ? prog[prog.length-1].total : 0;
    const feitos = prog.filter(p => p.status !== 'extraindo').length;
    const pct = total > 0 ? Math.round(feitos/total*100) : 0;
    document.getElementById('fill').style.width = pct + '%';
    document.getElementById('prog-pct').textContent = pct + '%';
    document.getElementById('prog-txt').textContent = 'Extraindo ' + feitos + ' de ' + total + '...';
    document.getElementById('prog-tbody').innerHTML = prog.map(p =>
      '<tr><td>'+p.i+'</td><td>'+p.nome+'</td><td>'+(p.status==='ok'?'✅':p.status==='indisponivel'?'⚠️ Indispon.':p.status==='extraindo'?'⏳':'❌')+'</td><td>'+(p.bairro||'—')+'</td><td>'+(p.cidade||'—')+'</td><td>'+(p.quartos||'—')+'</td><td>'+(p.area?p.area+'m²':'—')+'</td><td>'+(p.valor?'R$ '+Number(p.valor).toLocaleString('pt-BR'):'—')+'</td></tr>'
    ).join('');
    if (d.status === 'concluido' || d.status === 'erro') {
      clearInterval(poll);
      document.getElementById('prog-txt').textContent = '✅ Concluído!';
      document.getElementById('download-area').style.display = 'block';
      document.getElementById('btn-extrair').disabled = false;
      document.getElementById('btn-teste').disabled = false;
    }
  }, 2000);
}
function baixar() { window.open('/download', '_blank'); }
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status, progresso }));
    return;
  }
  if (req.method === 'GET' && req.url === '/download') {
    if (!resultadoFinal) { res.writeHead(404); res.end('Sem resultado'); return; }
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="leads_extraidos.xlsx"' });
    res.end(resultadoFinal);
    return;
  }
  if (req.method === 'POST' && req.url.startsWith('/extrair')) {
    if (status === 'rodando') { res.writeHead(400); res.end('Em andamento'); return; }
    let body = [];
    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(body);
        const _ehCsvServer = req.url.includes('csv=1');
        const wb = _ehCsvServer ? XLSX.read(buf.toString('utf-8'), { type: 'string' }) : XLSX.read(buf, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rowsGlobal = XLSX.utils.sheet_to_json(ws);
        if (rowsGlobal[0]) console.log('📑 Colunas encontradas:', Object.keys(rowsGlobal[0]).join(' | '));
        const _urlParams = new URLSearchParams(req.url.split('?')[1] || '');
        const _limite = parseInt(_urlParams.get('limite') || '0');
        if (_limite > 0) rowsGlobal = rowsGlobal.slice(0, _limite);
        console.log('📋', rowsGlobal.length, 'leads — iniciando extração...');
        rodarExtracao().catch(e => { status = 'erro'; console.error(e); });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) { res.writeHead(500); res.end(e.message); }
    });
    return;
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(3000, () => {
  console.log('🚀 Extrator rodando em http://localhost:3000');
});
