import { exampleCourses, newSemester, suggestSemesterName } from '@uniplan/core';

/** The example courses in one semester named after the current term, the way the apps store a plan. */
export const examplePlan = () => ({ version: 2, semesters: [newSemester(suggestSemesterName([]), { courses: exampleCourses() })] });
