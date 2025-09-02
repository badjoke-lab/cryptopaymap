import fs from 'fs'; import path from 'path';
const root = path.resolve(process.cwd(), 'public/data'); const pTopics = path.join(root,'news/topics.json'); const pArticles = path.join(root,'news/articles.json');
if(!fs.existsSync(pTopics) || !fs.existsSync(pArticles)){ console.log('[SKIP] news aggregates (missing files)'); process.exit(0); }
const topics = JSON.parse(fs.readFileSync(pTopics,'utf-8'));
const top = (topics.topics||[]).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,20).map((t,i)=>({topic_id:t.id, rank:i+1, score:t.score||0}));
fs.mkdirSync(path.join(root,'aggregates'),{recursive:true}); fs.writeFileSync(path.join(root,'aggregates/hot-topics.json'), JSON.stringify({generated_at:new Date().toISOString(), top}, null, 2));
console.log('[OK] News aggregates -> hot-topics.json');
