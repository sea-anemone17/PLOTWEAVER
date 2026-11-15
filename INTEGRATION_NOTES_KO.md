# PLOTWEAVER Supabase + Google Drive 통합 안내

이 소스는 StackBlitz에서 내보낸 버전을 기준으로 합니다. Supabase 사용자 인증, Storage 암호화 백업, Google Drive 암호화 백업 UI가 포함됩니다. 기존 PWE1 암호화 알고리즘은 변경하지 않았습니다.

## 사용 전 설정

1. Supabase Authentication > URL Configuration에 배포 주소 `https://sea-anemone17.github.io/PLOTWEAVER/`를 Redirect URL로 등록합니다. Google provider가 활성화되어 있어야 합니다.
2. Supabase Storage `plotweaver-backups` 버킷이 이미 존재하므로 삭제하거나 재생성하지 마세요. 기존 Storage 정책을 먼저 검토하세요. `supabase/migrations/20261115_private_cloud_vault.sql`은 정책을 재정의할 수 있으므로 운영 프로젝트에 무작정 실행하지 마세요.
3. Google Cloud Console에서 Google Drive API를 활성화하고 OAuth 클라이언트의 Authorized JavaScript origins에 `https://sea-anemone17.github.io`를 등록하세요. StackBlitz 프리뷰에서는 프리뷰 origin도 등록해야 할 수 있습니다. Drive 권한은 Supabase 로그인과 별도입니다.
4. `npm ci`, `npm run build`, `npm test`를 실행한 후 배포하세요. 이 환경에서는 npm 설치가 시간 초과되어 빌드/테스트 성공을 검증하지 못했습니다.

## 데이터 안전

- `PWE1` 암호화 파일은 AES-GCM, PBKDF2-SHA256 250,000회 기반이며 원본 호환성을 유지합니다.
- 백업은 수동 실행이며 실시간 동기화는 아닙니다.
- 비밀번호는 앱에만 입력하고 공유하지 마세요.
- 기존 `.pwenc` 백업을 삭제하거나 덮어쓰지 마세요.
- Google Drive OAuth 클라이언트 ID는 이전에 제공된 공개용 클라이언트 ID를 기본값으로 설정했습니다.
