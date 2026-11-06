from pathlib import Path
import asyncio,json
import edge_tts
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');out=root/'artifacts/interview-avatars/voice-comparison';out.mkdir(exist_ok=True)
text='협업 중 의견 차이를 해결한 경험을 말씀해 주세요.'
async def main():
 configs=[('sunhi-natural','+0%','+0Hz'),('sunhi-interview','+8%','-8Hz')]
 for name,rate,pitch in configs:
  await edge_tts.Communicate(text,'ko-KR-SunHiNeural',rate=rate,pitch=pitch).save(str(out/(name+'.mp3')))
  (out/(name+'.json')).write_text(json.dumps({'text':text,'voice':'ko-KR-SunHiNeural','rate':rate,'pitch':pitch,'purpose':'comparison sample only'},ensure_ascii=False,indent=2))
  print('COMPLETE',name,flush=True)
asyncio.run(main())
