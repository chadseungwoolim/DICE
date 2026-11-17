const message=document.getElementById('loadMessage');
if(location.protocol==='file:'){
  message.textContent='파일을 직접 열면 3D가 실행되지 않습니다. README의 로컬 서버 명령을 사용하거나 웹 호스팅에 업로드하세요.';
}else{
  import('./app.js').catch(error=>{
    console.error(error);
    message.hidden=false;
    message.style.zIndex='10';
    message.textContent='3D 실행에 실패했습니다. 인터넷 연결, cdn.jsdelivr.net 접근 및 브라우저 WebGL 지원을 확인하세요. 오류: '+error.message;
  });
}
