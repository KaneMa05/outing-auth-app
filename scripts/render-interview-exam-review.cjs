'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const benchmark=require('../lib/interview-exam-benchmark.cjs');
const model=require('../lib/interview-exam-review-model.js');
const STYLE=fs.readFileSync(path.join(__dirname,'..','client/interview-exam-review.css'),'utf8');
function renderReview(d){
 benchmark.validateDataset(d);
 const scripts=['lib/interview-exam-review-model.js','client/interview-exam-review-view.js','client/interview-exam-review.js'].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
 const sha=value=>"'sha256-"+crypto.createHash('sha256').update(value).digest('base64')+"'";
 const csp=`default-src 'none'; script-src ${scripts.map(sha).join(' ')}; style-src ${sha(STYLE)}; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
 const json=JSON.stringify(model.publicDataset(d)).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>전공 채점 · 강사 검수</title><style>${STYLE}</style></head><body><div id="review-app"></div><noscript>검수 화면을 사용하려면 JavaScript가 필요합니다. 기존 읽기 전용 review.html에서도 자료를 확인할 수 있습니다.</noscript><script type="application/json" id="review-dataset">${json}</script>${scripts.map(script=>`<script>${script}</script>`).join('')}</body></html>`;
}
module.exports={renderReview};
