/**
 * Classroom Advanced Service 호출 전담 (FR-015, FR-028~032). 이 시스템이 만든 과제만
 * 기록·채점 대상이 된다 — 과제ID는 이 게이트웨이가 생성할 때만 기록된다(FR-057).
 */

function createCourseWorkForAssignment(courseId, title, formId, startDate, dueDate, maxPoints) {
  var formUrl = FormApp.openById(formId).getPublishedUrl();
  var courseWork = {
    title: title,
    materials: [{ link: { url: formUrl } }],
    workType: 'ASSIGNMENT',
    state: 'DRAFT',
    scheduledTime: toRfc3339_(startDate),
    maxPoints: maxPoints,
    dueDate: toClassroomDate_(dueDate),
    dueTime: toClassroomTimeOfDay_(dueDate),
  };
  var created = Classroom.Courses.CourseWork.create(courseWork, courseId);
  return created.id;
}

function toRfc3339_(date) {
  return new Date(date).toISOString();
}

function toClassroomDate_(date) {
  var d = new Date(date);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function toClassroomTimeOfDay_(date) {
  var d = new Date(date);
  return { hours: d.getHours(), minutes: d.getMinutes() };
}

/**
 * 학생 제출물에 점수를 반영한다. shouldSendGrade(gradeSendPolicy.js)로 멱등 판단이 끝난
 * 건에 대해서만 호출부가 이 함수를 불러야 한다 — 여기서는 실제 API 호출과 실패 격리만 한다.
 */
function returnGradeToSubmission(courseId, courseWorkId, submissionId, score) {
  try {
    Classroom.Courses.CourseWork.StudentSubmissions.patch(
      { assignedGrade: score, draftGrade: score },
      courseId,
      courseWorkId,
      submissionId,
      { updateMask: 'assignedGrade,draftGrade' }
    );
    Classroom.Courses.CourseWork.StudentSubmissions.return({}, courseId, courseWorkId, submissionId);
    return { ok: true };
  } catch (err) {
    // 실패는 학생 단위로 격리한다(FR-032) — 예외를 위로 던지지 않고 호출부가 다음 실행에서
    // 재시도할 수 있도록 결과 객체로만 알린다.
    return { ok: false, error: err.message };
  }
}

function listStudentSubmissions(courseId, courseWorkId) {
  var response = Classroom.Courses.CourseWork.StudentSubmissions.list(courseId, courseWorkId);
  return response.studentSubmissions || [];
}

function listCourseStudents(courseId) {
  var response = Classroom.Courses.Students.list(courseId);
  return response.students || [];
}
