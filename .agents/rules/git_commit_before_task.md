# Rule: 작업 전 깃 커밋 (Git Commit Before Starting Tasks)

## Description
사용자의 새로운 기능 개발, 코드 수정, 리팩토링 등 모든 작업(Task)을 시작하기 전에 현재 작업 트리의 변경 사항을 안전하게 깃 커밋(git commit)해야 합니다.

## Execution Rules
1. **작업 시작 전 깃 상태 확인**: 새로운 작업을 시작하기 직전 `git status`를 실행하여 작업 트리를 확인합니다.
2. **미커밋 변경사항 보존**: 커밋되지 않은 파일이나 변경사항이 존재하는 경우, 수정 작업을 진행하기 전에 `git add` 및 `git commit`을 먼저 수행하여 작업 전 상태를 보존합니다.
3. **커밋 메시지 규칙**: `feat`, `fix`, `refactor`, `chore` 등 변경 내용에 맞는 직관적인 커밋 메시지를 작성합니다.
