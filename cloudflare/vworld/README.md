# VWorld 지도 중계

GitHub Pages는 웹사이트를 제공하고, 이 Worker는 VWorld 지도 요청만 중계합니다.
VWorld 인증키는 Worker의 Secret에 저장되며 웹사이트 파일에는 포함되지 않습니다.

## 배포 준비

1. Cloudflare 계정을 만들고 Workers 설정에서 workers.dev 주소를 활성화합니다.
2. Cloudflare API Tokens에서 Workers 배포 권한 토큰을 발급합니다. 대상 계정은 본인 계정으로 제한합니다.
3. GitHub 저장소 Actions Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 등록합니다. 기존 `VWORLD_API_KEY`도 사용합니다.
4. Actions의 `VWorld private map proxy`에서 `Run workflow`를 실행합니다.
5. 배포 결과의 HTTPS workers.dev 주소를 웹사이트 지도 중계 주소로 연결합니다.

현재 사이트를 연결하기 전까지 기존 지도는 유지됩니다. 중계 서버 배포와 실제 VWorld PNG 수신을 확인한 뒤 전환합니다.
타일 경로는 `/tiles/{z}/{x}/{y}.png`이며 CORS Origin은 `https://yohyeseong.github.io`만 허용합니다.
한국 범위, 좌표, PNG 형식, IP별 호출 제한을 검사합니다. Origin 검사는 호출 비용 보호를 위한 제한이며 사용자 인증 기능은 아닙니다.
원본 VWorld 오류, 키가 들어간 상위 URL, 상위 서버의 헤더를 클라이언트에 반환하지 않습니다.
대량 사전 다운로드와 장기 저장은 구현하지 않았습니다. 데이터 자체 다운로드·콘타 가공은 지도 표시와 별도입니다.

공식 문서: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
