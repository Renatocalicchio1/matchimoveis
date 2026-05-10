content = open('cerebro/imoveis.js').read()

old = "r.slice(0,5).map(i=>{ const lid=i.id||(i.idExterno?'MI-'+i.idExterno:''); const val=i.valor_imovel?'· R"

new_line = (
    "r.slice(0,5).map(i=>{"
    " const lid=i.id||(i.idExterno?'MI-'+i.idExterno:'');"
    " const val=i.valor_imovel?'· R$'+Number(i.valor_imovel).toLocaleString('pt-BR'):'';"
    " const qts=i.quartos?i.quartos+'q':'';"
    " const vgs=i.vagas?i.vagas+'vg':'';"
    " return '• <a href=\"/app/imovel/'+lid+'\" target=\"_blank\" style=\"color:#ff385c;font-weight:700\">'+(i.tipo||'Imóvel')+' — '+(i.bairro||'')+'</a> '+qts+' '+vgs+' '+val;"
    " }).join('<br>')"
)

if old in content:
    content = content.replace(old, new_line)
    open('cerebro/imoveis.js','w').write(content)
    print('ok')
else:
    print('nao encontrado')
