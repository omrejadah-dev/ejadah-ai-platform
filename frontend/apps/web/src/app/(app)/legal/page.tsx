import { Card, CardBody, CardHeader, Note } from "@platform/ui-kit";

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold text-heading">اسأل إجادة القانونية</h1>
      <Note tone="info">إجابات استرشادية من نصوص الأنظمة العقارية السعودية، وليست استشارة قانونية.</Note>
      <Card>
        <CardHeader><span className="font-bold text-heading">قريباً</span></CardHeader>
        <CardBody><p className="text-sm text-text-2">المساعد القانوني يعمل على مكتبة من 45 نظاماً ولائحة جُمعت من الهيئة العامة للعقار وهيئة الخبراء. يُفعَّل في المرحلة هـ من الخطة.</p></CardBody>
      </Card>
    </div>
  );
}
