const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:process.env.TEST_CHROME});try{
 const p=await b.newPage();
 for(const state of ['unregistered','registered-off','registered-on']){
 const registered=state!=='unregistered',fill=registered?'#FFFFFF':'#9299A3',line=registered?'#16212B':'#707780',gpu=state==='registered-on'?'#24C969':'#777F89';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><path d="M13 24Q36 15 64 29Q92 15 115 24V87Q89 79 64 91Q39 79 13 87Z" fill="${fill}" stroke="#F3F4F6" stroke-width="11" stroke-linejoin="round"/><path d="M13 24Q36 15 64 29Q92 15 115 24V87Q89 79 64 91Q39 79 13 87Z" fill="${fill}" stroke="${line}" stroke-width="7" stroke-linejoin="round"/><path d="M64 29V87" stroke="${line}" stroke-width="7"/><g stroke="#F3F4F6" stroke-width="10" stroke-linecap="square"><path d="M48 80V69M64 80V69M80 80V69M48 111V121M64 111V121M80 111V121M44 87H33M44 103H33M85 87H96M85 103H96"/></g><g stroke="${line}" stroke-width="6"><path d="M48 80V69M64 80V69M80 80V69M48 111V121M64 111V121M80 111V121M44 87H33M44 103H33M85 87H96M85 103H96"/></g><rect x="41" y="77" width="46" height="36" rx="7" fill="${gpu}" stroke="#F3F4F6" stroke-width="10"/><rect x="41" y="77" width="46" height="36" rx="7" fill="${gpu}" stroke="${line}" stroke-width="6"/></svg>`;
 fs.writeFileSync(path.join(__dirname,'extension/icons',state+'.svg'),svg);
 for(const size of [16,32,48,128]){await p.setViewportSize({width:size,height:size});await p.setContent('<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>'+svg);await p.screenshot({path:path.join(__dirname,'extension/icons',state+'-'+size+'.png'),omitBackground:true});}
 }await p.close();
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
