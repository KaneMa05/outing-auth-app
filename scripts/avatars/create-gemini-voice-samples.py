from pathlib import Path
import re,json,base64,urllib.request,urllib.error
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');env=(root/'.env.local').read_text();m=re.search(r'^GEMINI_API_KEY\s*=\s*(.+)$',env,re.M)
if not m:raise SystemExit('Gemini key setting unavailable')
key=m.group(1).strip().strip('\"\'');out=root/'artifacts/interview-avatars/voice-comparison';out.mkdir(exist_ok=True)
for voice in ['Kore','Charon']:
 if voice=='Charon':continue
 body={'model':'gemini-3.8-flash-tts','input':[{'type':'user_input','content':[{'type':'text','text':'협업 중 의견 차이를 해결한 경험을 말씀해 주세요.','annotations':[{'type':'speech_metadata','style':'Native Korean, mature female interviewer, composed and attentive. Natural fluent connected speech, conversational pace, clear but not exaggerated articulation, firm polite ending.'}]}]}],'response_format':{'type':'audio'},'generation_config':{'speech_config':[{'voice':voice}]}}
 req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/interactions',data=json.dumps(body).encode(),headers={'x-goog-api-key':key,'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=120) as r:response=json.load(r)
 except urllib.error.HTTPError as e:
  print('HTTP',e.code);raise SystemExit(1)
 blocks=[c for s in response.get('steps',[]) if s.get('type')=='model_output' for c in s.get('content',[]) if c.get('type')=='audio']
 if not blocks:raise SystemExit('No audio returned')
 (out/('gemini-'+voice.lower()+'.wav')).write_bytes(base64.b64decode(blocks[-1]['data']))
 print('COMPLETE',voice,flush=True)
