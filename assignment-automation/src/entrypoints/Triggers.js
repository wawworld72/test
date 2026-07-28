/**
 * 시간 기반/onEdit 트리거가 호출하는 얇은 진입점. 이 계층에서는 UI 호출(getUi/alert)을
 * 하지 않는다(헌법 VI) — 사람에게 알려야 할 내용은 mailGateway(일일 요약)로만 나간다.
 * 모든 트리거 함수는 lockGateway로 동시 실행을 막는다(FR-061).
 */

/**
 * UC-08/UC-09/UC-10: 활성 과제 중 아직 준비가 끝나지 않은 행을 찾아 생성 Form → 응답 시트
 * 연결 → Classroom 게시 순서로 이어서 처리한다. 각 행의 실패는 그 행 단위로 격리되어
 * 나머지 행 처리를 막지 않는다(FR-052).
 */
function runAssignmentPreparation() {
  return runWithExclusiveLock('runAssignmentPreparation', function () {
    var ss = getBoundSpreadsheet();
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
    var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);
    var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));

    var courseId = readCourseConfigValue_(ss, '코스식별자');
    var semesterLabel = readCourseConfigValue_(ss, '학기') + ' ' + readCourseConfigValue_(ss, '과목명');

    var rows = readRowsAsObjects(formsSheet);
    var updates = [];

    rows
      .filter(function (row) {
        return row['활성'] === true || row['활성'] === 'TRUE';
      })
      .forEach(function (row) {
        try {
          var typeDef = (grouped.groups[row['역량과제']] || [])[0];
          if (!typeDef) {
            return;
          }

          var patch = { __row: row.__row };
          var changed = false;

          if (!row['생성Form']) {
            var title = semesterLabel + ' ' + row['주제'] + ' - ' + row['역량과제'];
            patch['생성Form'] = createGeneratedForm(typeDef['템플릿Form'], title, row['주제']);
            changed = true;
          }

          var formId = patch['생성Form'] || row['생성Form'];
          if (formId && !row['응답시트']) {
            var responseSheetTitle = '응답_' + row['주제'] + '_' + row['역량과제'];
            var sheetName = linkAndPrepareResponseSheet(formId, ss.getId(), responseSheetTitle);
            if (sheetName) {
              patch['응답시트'] = sheetName;
              changed = true;
            }
          }

          if (formId && (patch['응답시트'] || row['응답시트']) && !row['과제ID']) {
            var maxScore = (grouped.groups[row['역량과제']] || []).reduce(function (sum, r) {
              return sum + (Number(r['배점']) || 0);
            }, 0);
            var schedule = resolveEffectiveSchedule(row);
            patch['과제ID'] = createCourseWorkForAssignment(
              courseId, title || row['주제'] + ' - ' + row['역량과제'], formId, schedule.start, schedule.end, maxScore
            );
            patch['게시상태'] = PUBLISH_STATUS.PENDING;
            changed = true;
          }

          if (changed) {
            updates.push(patch);
          }
        } catch (err) {
          Logger.log('runAssignmentPreparation 행 ' + row.__row + ' 실패: ' + err.message);
        }
      });

    if (updates.length > 0) {
      writeRowObjectsBatched(formsSheet, updates);
    }
    return updates.length;
  });
}
