// Portable packaging with Node built-ins. Keep the signing key outside extension/.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dev=__dirname,workspace=path.dirname(dev),keyDir=path.join(workspace,'private-signing-api1'),keyPath=path.join(keyDir,'gpu-enhancer-0.9.5.pem');
fs.mkdirSync(keyDir,{recursive:true});
if(!fs.existsSync(keyPath)&&process.argv[2]!=='init')throw Error('Existing signing key required; refusing to change the extension identity');
if(!fs.existsSync(keyPath)){const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});fs.writeFileSync(keyPath,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});}
const key=crypto.createPrivateKey(fs.readFileSync(keyPath)),pub=crypto.createPublicKey(key).export({type:'spki',format:'der'});
const manifestPath=path.join(dev,'extension','manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(!manifest.version_name?.endsWith(manifest.version))throw Error('Manifest version_name does not match version');
const version=manifest.version,prefix='Kavita-Komga-GPU-Image-Enhancer-'+version;
const id=Array.from(crypto.createHash('sha256').update(pub).digest().subarray(0,16)).map(v=>String.fromCharCode(97+(v>>4),97+(v&15))).join('');
if(process.argv[2]==='init'){manifest.key=pub.toString('base64');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log('Signing identity initialized: '+id);process.exit(0);}
if(manifest.key!==pub.toString('base64'))throw Error('Signing key does not match the existing manifest identity');
const zipPath=path.join(workspace,prefix+'.zip'),data=fs.readFileSync(zipPath);
const varint=n=>{const out=[];while(n>127){out.push((n&127)|128);n>>>=7;}out.push(n);return Buffer.from(out);};
const field=(n,data)=>Buffer.concat([varint(n*8+2),varint(data.length),data]);
const signed=field(1,crypto.createHash('sha256').update(pub).digest().subarray(0,16)),len=Buffer.alloc(4);len.writeUInt32LE(signed.length);
const payload=Buffer.concat([Buffer.from('CRX3 SignedData\0'),len,signed,data]);
const signature=crypto.sign('sha256',payload,{key,padding:crypto.constants.RSA_PKCS1_PADDING});
if(!crypto.verify('sha256',payload,{key:crypto.createPublicKey(key),padding:crypto.constants.RSA_PKCS1_PADDING},signature))throw Error('Signature verification failed');
const header=Buffer.concat([field(2,Buffer.concat([field(1,pub),field(2,signature)])),field(10000,signed)]),prefixBytes=Buffer.alloc(12);prefixBytes.write('Cr24');prefixBytes.writeUInt32LE(3,4);prefixBytes.writeUInt32LE(header.length,8);
const crxPath=path.join(workspace,prefix+'.crx');fs.writeFileSync(crxPath,Buffer.concat([prefixBytes,header,data]));
const output=fs.readFileSync(crxPath);if(!output.subarray(12+header.length).equals(data))throw Error('CRX ZIP mismatch');
console.log('PASS CRX3 signature and embedded install ZIP; extension ID '+id);
