import { getPostgresClient } from '@/db/client';
import { Banner, BannerPosition } from '@/types';

function mapBanner(row: any): Banner {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    subtitle: row.subtitle || undefined,
    image: String(row.image || ''),
    linkUrl: row.link_url || undefined,
    badge: row.badge || undefined,
    isActive: Boolean(row.is_active),
    order: Number(row.order_index || 0),
    position: (row.position || 'top') as BannerPosition,
    category: row.category_name || undefined,
    isCampaignShowcase: Boolean(row.is_campaign_showcase),
    campaignBgColor: row.campaign_bg_color || undefined,
    campaignProductsTitle: row.campaign_products_title || undefined,
    campaignProductIds: Array.isArray(row.campaign_product_ids) ? row.campaign_product_ids.map(String) : [],
    isTextShelf: Boolean(row.is_text_shelf),
    isSpriteSlider: Boolean(row.is_sprite_slider),
    bannerBgColor: row.banner_bg_color || undefined,
  };
}

async function resolveCategoryId(category?: string | null): Promise<string | null> {
  if (!category || !category.trim()) return null;
  const sql = getPostgresClient();
  const rows = await sql`SELECT id FROM categories WHERE name = ${category.trim()} OR slug = ${category.trim()} LIMIT 1;`;
  return rows.length ? String(rows[0].id) : null;
}

export async function pgGetBanners(activeOnly = true, position?: string, category?: string): Promise<Banner[]> {
  const sql = getPostgresClient();
  const rows = await sql`
    SELECT * FROM banners
    WHERE (${activeOnly} = false OR is_active = true)
      AND (${position || null}::text IS NULL OR position = ${position || null})
      AND (${category || null}::text IS NULL OR category_name = ${category || null})
    ORDER BY order_index ASC, created_at ASC;
  `;
  return rows.map(mapBanner);
}

export async function pgCreateBanner(data: Partial<Banner>): Promise<Banner> {
  const sql = getPostgresClient();
  if (!data.title?.trim()) throw new Error('عنوان البنر مطلوب');
  if (!data.image?.trim() && !data.isTextShelf) throw new Error('صورة البنر مطلوبة');

  const categoryId = await resolveCategoryId(data.category);
  const rows = await sql`
    INSERT INTO banners (
      title, subtitle, image, link_url, badge, is_active, order_index, position,
      category_id, category_name, is_campaign_showcase, campaign_bg_color,
      campaign_products_title, campaign_product_ids, is_text_shelf,
      is_sprite_slider, banner_bg_color
    ) VALUES (
      ${data.title.trim()}, ${data.subtitle || null}, ${data.image || ''}, ${data.linkUrl || null},
      ${data.badge || null}, ${data.isActive !== false}, ${Number(data.order || 0)}, ${data.position || 'top'},
      ${categoryId}, ${data.category || null}, ${Boolean(data.isCampaignShowcase)}, ${data.campaignBgColor || null},
      ${data.campaignProductsTitle || null}, ${JSON.stringify(data.campaignProductIds || [])}::jsonb,
      ${Boolean(data.isTextShelf)}, ${Boolean(data.isSpriteSlider)}, ${data.bannerBgColor || null}
    ) RETURNING *;
  `;
  return mapBanner(rows[0]);
}

export async function pgUpdateBanner(id: string, updates: Partial<Banner>): Promise<Banner> {
  const sql = getPostgresClient();
  const fields: Record<string, any> = {};

  if (updates.title !== undefined) fields.title = updates.title.trim();
  if (updates.subtitle !== undefined) fields.subtitle = updates.subtitle || null;
  if (updates.image !== undefined) fields.image = updates.image || '';
  if (updates.linkUrl !== undefined) fields.link_url = updates.linkUrl || null;
  if (updates.badge !== undefined) fields.badge = updates.badge || null;
  if (updates.isActive !== undefined) fields.is_active = Boolean(updates.isActive);
  if (updates.order !== undefined) fields.order_index = Number(updates.order || 0);
  if (updates.position !== undefined) fields.position = updates.position || 'top';
  if (updates.category !== undefined) {
    fields.category_name = updates.category || null;
    fields.category_id = await resolveCategoryId(updates.category);
  }
  if (updates.isCampaignShowcase !== undefined) fields.is_campaign_showcase = Boolean(updates.isCampaignShowcase);
  if (updates.campaignBgColor !== undefined) fields.campaign_bg_color = updates.campaignBgColor || null;
  if (updates.campaignProductsTitle !== undefined) fields.campaign_products_title = updates.campaignProductsTitle || null;
  if (updates.campaignProductIds !== undefined) fields.campaign_product_ids = JSON.stringify(updates.campaignProductIds || []);
  if (updates.isTextShelf !== undefined) fields.is_text_shelf = Boolean(updates.isTextShelf);
  if (updates.isSpriteSlider !== undefined) fields.is_sprite_slider = Boolean(updates.isSpriteSlider);
  if (updates.bannerBgColor !== undefined) fields.banner_bg_color = updates.bannerBgColor || null;

  if (Object.keys(fields).length === 0) {
    const rows = await sql`SELECT * FROM banners WHERE id = ${id} LIMIT 1;`;
    if (!rows.length) throw new Error('البنر غير موجود');
    return mapBanner(rows[0]);
  }

  const rows = await sql`UPDATE banners SET ${sql(fields)} WHERE id = ${id} RETURNING *;`;
  if (!rows.length) throw new Error('البنر غير موجود');
  return mapBanner(rows[0]);
}

export async function pgDeleteBanner(id: string): Promise<boolean> {
  const sql = getPostgresClient();
  const result = await sql`DELETE FROM banners WHERE id = ${id};`;
  return result.count > 0;
}
