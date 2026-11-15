# PLOTWEAVER Cloud v1.0 — 단계별 구현 및 사용자 설정

상태: **설계·환경설정 기반 단계**. 클라우드 업로드, 로그인, Drive 접근은 아직 활성화하지 않는다.

## 불변 원칙
1. IndexedDB가 집필의 주 저장소이며 오프라인 상태에서 읽기·쓰기·백업이 가능해야 한다.
2. **최초 로그인 시 자동 업로드 금지**: 로컬 프로젝트를 선택하고, 내보내기 전 ZIP 백업을 생성한 뒤 명시적으로 연결한다.
3. 서버에서 받은 원고를 기존 로컬 원고 위에 무조건 덮어쓰지 않는다. 동기화는 리비전 확인과 충돌 복제/사용자 선택이 필요하다.
4. Google 로그인만으로 Drive 권한을 요구하지 않는다. Drive 백업 버튼을 눌렀을 때 최소 범위 권한을 별도로 요청한다.
5. 사용자 인증과 프로젝트 소유권을 RLS로 검증한다. 브라우저에는 Supabase publishable key만 두며 **service_role/secret 키, Google client secret, refresh token을 소스·localStorage·GitHub에 저장하지 않는다**.
6. 클라우드 실패가 로컬 저장 성공을 실패로 바꾸거나 기존 프로젝트를 삭제하지 않아야 한다.

## 0단계 — 환경 및 도메인 설정 (사용자)
- [ ] Supabase 프로젝트 생성: https://supabase.com/dashboard
- [ ] Project URL, Publishable Key 확인 (공개 클라이언트 값이지만 저장소에 하드코딩하지 않고 Vite 환경변수 사용)
- [ ] Google Cloud 프로젝트 생성: https://console.cloud.google.com/
- [ ] OAuth 동의 화면/브랜딩, 허용 사용자, 웹 OAuth 클라이언트 생성
- [ ] Google OAuth Client ID 및 Client Secret을 **Supabase Dashboard > Authentication > Providers > Google**에만 입력
- [ ] Supabase Dashboard가 안내하는 **Google 공급자용 콜백 URL**을 Google Cloud의 승인된 리디렉션 URI에 등록
- [ ] Supabase Auth의 **Site URL**과 **Redirect URLs**에 실제 GitHub Pages 배포 주소(예: https://<owner>.github.io/PLOTWEAVER/) 및 개발 주소를 정확히 등록
- [ ] 로컬 개발 시 HTTPS/localhost, 포트, 경로가 실제 앱과 일치하는지 확인
- [ ] Google Drive API 활성화 (Drive 백업 단계에 진행); 사용자별 앱 생성 파일 접근만 필요한 경우 `drive.file` 최소 권한을 우선 검토
- [ ] 공개 배포 전 Google OAuth 테스트 사용자/앱 게시 상태·Drive 권한 검증 요구사항 확인

### 로컬 환경변수 예시
```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```
실제 값은 **.env.local**에만 작성. 이 파일은 Git에 커밋하지 않는다. GitHub Pages 자동 빌드 시 공개 클라이언트 값만 Actions variables로 주입한다. `VITE_` 변수는 브라우저 번들에 포함되므로 비밀 키에 사용하지 않는다.

## 1단계 — Google 로그인
- Supabase JS SDK를 추가하고, **환경변수가 비어 있으면 클라우드 기능만 비활성화**한다.
- 로그인 버튼은 명시적 사용자 조작으로만 실행. `signInWithOAuth({provider:'google', options:{redirectTo: ...}})`.
- GitHub Pages의 `/PLOTWEAVER/` base path와 OAuth 복귀 경로 검증.
- 로그인/로그아웃/세션 복원 상태를 로컬 집필 상태와 분리.
- **로그아웃 시 IndexedDB는 그대로 둔다**. 공유 기기에서는 로컬 데이터가 남는다는 점을 안내.

## 2단계 — 서버 모델 및 RLS
- Supabase PostgreSQL: `cloud_projects(id uuid, owner_id uuid, revision bigint, snapshot jsonb, updated_at timestamptz)`.
- 원본 IndexedDB 프로젝트 ID를 보존하고 별도의 `remote_project_id` 매핑을 로컬에 저장한다.
- 서버 소유자 컬럼은 `auth.uid()`로 검사. 모든 읽기·쓰기·삭제 정책에서 owner_id 검증. INSERT는 WITH CHECK, UPDATE는 USING + WITH CHECK.
- 원고/장면/자료가 포함된 JSON snapshot의 크기 제한과 개인정보·GM 비공개 자료 접근 통제.
- 대용량 Blob은 JSON에 넣지 않고 Supabase Storage의 private bucket에 저장; 소유권 정책과 첨부파일 무결성 검증.
- 서버 데이터 변경은 **기존 revision이 일치할 때만 원자적으로 성공하는 RPC/조건부 업데이트**를 사용. 불일치 시 409에 준하는 충돌 상태 반환.
- 복구 기록·휴지통·전역 아이디어·지식 보관함 등 기존 ZIP 데이터 모델과 동기화 범위를 명시적으로 분리.

## 3단계 — 오프라인 동기화
- 로컬 DB에 `syncOutbox`, `syncBindings`, `syncConflicts` 추가.
- 원고 저장과 outbox 기록은 **같은 IndexedDB 트랜잭션**으로 처리.
- 인터넷이 끊겨도 outbox 유지; 재접속 후 순서대로 재시도, 중복 요청 방지용 operation ID.
- 최초 동기화 전에 ZIP 백업 생성 → 사용자 확인 → 프로젝트 선택 → 업로드.
- 서버 revision이 다른 경우 **로컬·서버 양쪽 버전 모두 보존** 후 사용자 선택. 자동 last-write-wins 금지.
- PC와 태블릿에서 같은 장면 동시 수정, 로그인 중단, 네트워크 오류, 용량 초과를 테스트.

## 4단계 — Google Drive 백업
- Google Drive API 및 OAuth scope `https://www.googleapis.com/auth/drive.file`를 검토해 최소 권한 사용.
- 사용자 버튼으로 기존 ZIP 생성 → SHA-256 확인 → Drive 업로드 → 백업 파일 ID·생성 시각 표시.
- Drive 백업은 **원고 동기화와 독립**; ZIP 다운로드 및 기존 검증·복원 경로 재사용.
- Drive API 토큰은 최소 범위·짧은 수명으로 취급; 필요한 경우 별도 서버 측 토큰 처리 설계. Supabase 로그인 세션과 Google Drive API 액세스 토큰은 동일하다고 가정하지 않는다.
- 백업 파일 목록·삭제·복원·권한 취소·실패 재시도 검증.

## 5단계 — 출시 전 테스트
- 기존 데이터 보유 상태에서 새 버전 실행: 로컬 데이터 개수/해시 불변.
- Supabase 환경변수 미설정, 로그인 실패, 오프라인, 인증 만료 시 기존 원고 작성 가능.
- 두 기기 동시 편집, 충돌, ZIP 복원, 첨부파일 무결성, 로그아웃 후 로컬 데이터 잔존.
- RLS 타 사용자 접근 차단 및 악의적 프로젝트 ID 요청.
- 실제 PC 크롬/갤럭시 탭 PWA 설치 상태 테스트.
- 기능 플래그와 단계적 출시. `main` 자동 병합 금지.

## 개발 참고
- 현재 GitHub Pages Vite `base:'/PLOTWEAVER/'`. 최종 OAuth Site URL은 실제 배포 주소 확인 후 확정.
- 현재 프로젝트의 브라우저 다중 탭 편집권은 **기기 내부에서만** 유효하며 클라우드 동기화의 revision 검사를 대체하지 못한다.
- 첫 구현 PR에서는 설정 검증과 오프라인 기본값만 추가하고 인증·업로드는 별도 PR로 진행한다.
