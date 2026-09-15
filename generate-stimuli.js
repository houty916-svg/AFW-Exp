const fs=require("fs");const path=require("path");const dir=path.join(__dirname,"Fear_images"),out=path.join(__dirname,"stimuli.json");const allowed=new Set([".jpg",".jpeg",".png",".webp",".bmp"]);if(!fs.existsSync(dir)){console.error("未找到 Fear_images 文件夹");process.exit(1)}const files=fs.readdirSync(dir).filter(name=>{const full=path.join(dir,name);return fs.statSync(full).isFile()&&allowed.has(path.extname(name).toLowerCase())}).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));if(!files.length){console.error("Fear_images 文件夹中没有图片");process.exit(1)}fs.writeFileSync(out,JSON.stringify(files,null,2),"utf8");console.log(`已生成 stimuli.json：${files.length} 张图片`);
// Publish only experiment assets; repository backups are not website files.
const publishDir=path.join(__dirname,"dist");
const imageOutput=path.join(publishDir,"Fear_images");
fs.mkdirSync(imageOutput,{recursive:true});
for(const name of fs.readdirSync(imageOutput)){
  if(!files.includes(name)&&fs.statSync(path.join(imageOutput,name)).isFile()){
    fs.unlinkSync(path.join(imageOutput,name));
  }
}
for(const name of files){
  const source=path.join(dir,name);
  if(fs.statSync(source).size>25*1024*1024){
    throw new Error(`图片超过 Cloudflare 单文件 25 MiB 限制：${name}`);
  }
  fs.copyFileSync(source,path.join(imageOutput,name));
}
fs.copyFileSync(path.join(__dirname,"index.html"),path.join(publishDir,"index.html"));
fs.copyFileSync(out,path.join(publishDir,"stimuli.json"));
console.log("已生成部署目录 dist（不包含 git.zip；functions 保留在项目根目录）");
