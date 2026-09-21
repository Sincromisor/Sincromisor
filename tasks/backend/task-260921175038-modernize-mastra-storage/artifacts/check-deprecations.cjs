const path = require('node:path');
const ts = require(process.cwd() + '/sincromisor-server/agent-server/node_modules/typescript');
for (const config of process.argv.slice(2)) {
 const configPath = path.resolve(config);
 const raw = ts.readConfigFile(configPath, ts.sys.readFile);
 const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, path.dirname(configPath));
 const host = {getScriptFileNames:()=>parsed.fileNames, getScriptVersion:()=> '0', getScriptSnapshot:f=>{const s=ts.sys.readFile(f);return s===undefined?undefined:ts.ScriptSnapshot.fromString(s)},getCurrentDirectory:()=>path.dirname(configPath),getCompilationSettings:()=>parsed.options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
 const service = ts.createLanguageService(host);
 let count=0;
 for(const f of parsed.fileNames){
 for(const d of service.getSuggestionDiagnostics(f)){
 if(!d.reportsDeprecated)continue;
 const pos=d.file.getLineAndCharacterOfPosition(d.start);
 console.log(`${path.relative(process.cwd(),f)}:${pos.line+1}:${pos.character+1} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`); count++;
 }}
 console.log(`${config}: ${parsed.fileNames.length} files, ${count} deprecated references`);
 service.dispose();
}
