from pathlib import Path
import asyncio,json
import edge_tts
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');out=root/'artifacts/interview-avatars/voice-comparison';out.mkdir(exist_ok=True)
async def main():
 samples=[('sunhi-interviewer-natural','협업 중 의견 차이를 해결한 경험을 말씀해 주세요.','+4%','+0Hz'),('sunhi-interviewer-direct','협업 중 의견 차이를 어떻게 해결하셨는지 말씀해 주시겠습니까?','+4%','+0Hz')]
 for name,text,rate,pitch in samples:
  await edge_tts.Communicate(text,'ko-KR-SunHiNeural',rate=rate,pitch=pitch).save(str(out/(name+'.mp3')))
  (out/(name+'.json')).write_text(json.dumps({'text':text,'voice':'ko-KR-SunHiNeural','rate':rate,'pitch':pitch,'purpose':'natural interviewer comparison'},ensure_ascii=False,indent=2))
  print('COMPLETE',name,flush=True)
asyncio.run(main())
