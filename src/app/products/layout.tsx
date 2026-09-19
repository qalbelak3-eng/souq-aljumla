import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'جميع المنتجات والأصناف الغذائية بالجملة | سوق جملة كربلاء',
  description: 'تصفح قائمة المواد الغذائية والسناكات والمشروبات بأسعار الجملة والمفرد في كربلاء - سوق جملة كربلاء.',
  alternates: {
    canonical: 'https://souqaljomla.com/products',
  },
};

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
