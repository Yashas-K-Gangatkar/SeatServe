import type { MetadataRoute } from "next";

const SITE_URL = "https://notifetch.in";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/faq`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/developers`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/legal/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/refund`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
