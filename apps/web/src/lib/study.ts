import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/I18nProvider";
import { request } from "./api";
import { getTelegramWebApp } from "./telegram";
import type { StudySubject } from "@zerolax/shared";
export const studyPath = (
  subject: StudySubject,
  grade?: string | number,
  book?: string,
) =>
  grade === undefined
    ? `/${subject}`
    : book
      ? `/${subject}/grades/${grade}/books/${book}`
      : `/${subject}/grades/${grade}/books`;
export const studyApi = <T>(
  subject: StudySubject,
  path: string,
  body?: unknown,
  method: "GET" | "POST" | "PUT" = body === undefined ? "GET" : "POST",
) =>
  request<T>(`/api/learning/user/subjects/${subject}${path}`, { body, method });
export function useStudyBack(parent: string, forceParent = false) {
  const navigate = useNavigate();
  const back = useCallback(() => {
    if (!forceParent && (window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(parent, { replace: true });
  }, [navigate, parent, forceParent]);
  useEffect(() => {
    const button = getTelegramWebApp()?.BackButton;
    if (!button) return;
    button.onClick(back);
    button.show();
    return () => {
      button.offClick(back);
      button.hide();
    };
  }, [back]);
  return back;
}
const words = {
  uz: {
    algebra: "Algebra",
    geometry: "Geometriya",
    chooseGrade: "Sinfingizni tanlang",
    grade: "SINF",
    books: "kitob",
    topics: "mavzu",
    progress: "O‘zlashtirish",
    emptyBooks: "Bu sinf uchun kitoblar hali nashr qilinmagan.",
    emptyTopics: "Bu kitob mavzulari hali nashr qilinmagan.",
    premium: "Premium kerak",
    premiumMessage:
      "Bu mavzu uchun faol Premium talab qilinadi. Premium ulash uchun administratorga murojaat qiling.",
    previous: "Oldingi kitobning yakuniy imtihonidan o‘ting.",
    intermediate: "Oldingi oraliq imtihondan o‘ting.",
    locked: "Qulflangan",
    available: "Ochiq",
    free: "Bepul",
    completed: "Yakunlangan",
    notStarted: "Boshlanmagan",
    inProgress: "Davom etmoqda",
    submitted: "Topshirilgan",
    expired: "Vaqti tugagan",
    passed: "O‘tilgan",
    test: "Mavzu testi",
    testSoon: "Test hali nashr qilinmagan",
    startTest: "Mavzu testini boshlash",
    questionCount: "10 ta savol",
    remaining: "Qolgan urinishlar",
    back: "Orqaga",
    notFound: "Sahifa topilmadi",
    notFoundMessage:
      "Sinf, kitob yoki mavzu mavjud emas yoki bu fanga tegishli emas.",
    unavailable: "Hozircha mavjud emas",
    exams: "Kitob imtihonlari",
    final: "Yakuniy imtihon",
    block: "Oraliq imtihon",
    start: "Boshlash",
    finish: "Testni yakunlash",
    confirm: "Testni yakunlashni tasdiqlaysizmi?",
    result: "Test natijasi",
    score: "Ball",
    time: "Qolgan vaqt",
    certificates: "Mening sertifikatlarim",
    noCertificates:
      "Hozircha sertifikat yo‘q. Sertifikat yakuniy kitob imtihonidan kamida 80 ball olganda beriladi.",
    certificateEligible: "Sertifikat olish sharti bajarildi.",
    certificateModule: "Sertifikatlarni ko‘rish",
    download: "PDF yuklash",
    verify: "Tekshirish",
    retakeLimit: "Urinishlar tugagan yoki testdan o‘tilgan.",
    saved: "Javob saqlandi",
    retry: "Qayta urinish",
    nextUnlocked: "Keyingi kitob ochildi",
    review: "Mavzularni takrorlang.",
    repeat: "Kitobni qayta o‘rganing.",
    pending: "Bu ball uchun natija qoidasini administrator belgilaydi.",
    studyAgain: "Darsga qaytish",
    more: "Keyingi sahifa",
  },
  ru: {
    algebra: "Алгебра",
    geometry: "Геометрия",
    chooseGrade: "Выберите свой класс",
    grade: "КЛАСС",
    books: "книг",
    topics: "тем",
    progress: "Прогресс",
    emptyBooks: "Книги для этого класса ещё не опубликованы.",
    emptyTopics: "Темы этой книги ещё не опубликованы.",
    premium: "Нужен Premium",
    premiumMessage:
      "Для этой темы требуется активный Premium. Обратитесь к администратору.",
    previous: "Сдайте итоговый экзамен предыдущей книги.",
    intermediate: "Сдайте предыдущий промежуточный экзамен.",
    locked: "Закрыто",
    available: "Доступно",
    free: "Бесплатно",
    completed: "Завершено",
    notStarted: "Не начат",
    inProgress: "В процессе",
    submitted: "Отправлен",
    expired: "Время истекло",
    passed: "Сдан",
    test: "Тест темы",
    testSoon: "Тест ещё не опубликован",
    startTest: "Начать тест темы",
    questionCount: "10 вопросов",
    remaining: "Осталось попыток",
    back: "Назад",
    notFound: "Страница не найдена",
    notFoundMessage:
      "Класс, книга или тема отсутствует либо относится к другому предмету.",
    unavailable: "Пока недоступно",
    exams: "Экзамены книги",
    final: "Итоговый экзамен",
    block: "Промежуточный экзамен",
    start: "Начать",
    finish: "Завершить тест",
    confirm: "Завершить тест?",
    result: "Результат теста",
    score: "Баллы",
    time: "Осталось времени",
    certificates: "Мои сертификаты",
    noCertificates:
      "Сертификатов пока нет. Сертификат выдаётся при результате от 80 баллов на итоговом экзамене книги.",
    certificateEligible: "Условие получения сертификата выполнено.",
    certificateModule: "Открыть сертификаты",
    download: "Скачать PDF",
    verify: "Проверить",
    retakeLimit: "Попытки закончились или тест уже сдан.",
    saved: "Ответ сохранён",
    retry: "Повторить",
    nextUnlocked: "Следующая книга открыта",
    review: "Повторите материал.",
    repeat: "Изучите книгу заново.",
    pending: "Правило для этого результата задаёт администратор.",
    studyAgain: "Вернуться к уроку",
    more: "Следующая страница",
  },
  en: {
    algebra: "Algebra",
    geometry: "Geometry",
    chooseGrade: "Choose your grade",
    grade: "GRADE",
    books: "books",
    topics: "topics",
    progress: "Progress",
    emptyBooks: "No published books for this grade yet.",
    emptyTopics: "No published topics for this book yet.",
    premium: "Premium required",
    premiumMessage:
      "This topic requires active Premium. Contact an administrator for access.",
    previous: "Pass the previous book’s final exam first.",
    intermediate: "Pass the preceding intermediate exam first.",
    locked: "Locked",
    available: "Available",
    free: "Free",
    completed: "Completed",
    notStarted: "Not started",
    inProgress: "In progress",
    submitted: "Submitted",
    expired: "Time expired",
    passed: "Passed",
    test: "Topic test",
    testSoon: "Test is not published yet",
    startTest: "Start topic test",
    questionCount: "10 questions",
    remaining: "Attempts remaining",
    back: "Back",
    notFound: "Page not found",
    notFoundMessage:
      "This grade, book or topic does not exist or belongs to a different subject.",
    unavailable: "Not available yet",
    exams: "Book exams",
    final: "Final exam",
    block: "Intermediate exam",
    start: "Start",
    finish: "Finish test",
    confirm: "Finish and submit this test?",
    result: "Test result",
    score: "Score",
    time: "Time remaining",
    certificates: "My certificates",
    noCertificates:
      "No certificates yet. Certificates are issued for qualifying final book exam results, starting at 80 points.",
    certificateEligible: "Certificate eligibility reached.",
    certificateModule: "View certificates",
    download: "Download PDF",
    verify: "Verify",
    retakeLimit: "No attempts remain or the test has already been passed.",
    saved: "Answer saved",
    retry: "Retry",
    nextUnlocked: "Next book unlocked",
    review: "Review the material.",
    repeat: "Study the book again.",
    pending: "An administrator must configure this result policy.",
    studyAgain: "Back to lesson",
    more: "Next page",
  },
};
export function useStudyWords() {
  const { language } = useI18n();
  return words[language];
}
