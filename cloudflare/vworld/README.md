# VWorld 데이터 전용 중계

Cloudflare Workers에 배포한 데이터 전용 서버입니다. 지도 이미지는 요청하거나 반환하지 않습니다.
VWorld 인증키는 Worker Secret에만 보관합니다. GitHub Pages 파일에는 키를 넣지 않습니다.

## 데이터

- 도로명주소 건물: LT_C_SPBD
- 도로명주소 도로: LT_L_SPRD
- 좌표계: EPSG:4326
- 응답: GeoJSON FeatureCollection, 현재 페이지와 전체 도형 개수
- 경로: /data/buildings 또는 /data/roads
- 검색: bbox=서쪽,남쪽,동쪽,북쪽 및 page=1..20
- 범위: 한국, 각 변 3km 이하, 면적 4km² 이하

사이트 Origin https://yohyeseong.github.io에서만 브라우저 요청을 허용합니다.
개별 데이터의 저장·활용 조건과 출처 표시는 별도로 적용해야 합니다.
이 서버는 데이터 수신 단계이며 모델에 넣을 때 군사시설 관련 제외 정책과 중복 도형 검증을 적용해야 합니다.
지도 이미지를 중계하던 worker.mjs는 현재 실행하지 않습니다. 실제 실행 파일은 data-worker.mjs입니다.

## 배포 상태

Cloudflare 배포, HTTPS, 서버 Secret 확인 및 단위 검증은 통과했습니다.
2026-10-02 실수신 시험은 VWorld 상위 서비스 HTTP 520 응답으로 실패했습니다.
직접 API와 VWorld 공식 예제의 자체 proxy 경로를 확인했지만 동일했습니다.
실데이터를 받았다고 완료 처리하지 않으며 기존 사이트의 지도·모델 원본은 유지합니다.

GitHub Actions VWorld private data proxy에서 상태를 확인하고 서비스 복구 후 재실행할 수 있습니다.

공식 API 예제: https://github.com/V-world/V-world_API_sample
공공데이터 안내: https://www.data.go.kr/data/15140372/openapi.do
