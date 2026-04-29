while true
do
  echo "Verificando novos uploads..."
  node -e "
    const fs=require('fs');
    const files=fs.readdirSync('uploads').map(f=>({f, t:fs.statSync('uploads/'+f).mtime}));
    files.sort((a,b)=>b.t-a.t);
    if(files[0]){
      console.log(files[0].f);
    }
  " | xargs -I{} node processAndMatch.js "uploads/{}"

  sleep 15
done
