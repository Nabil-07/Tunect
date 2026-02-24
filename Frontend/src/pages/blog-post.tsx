import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import SEO from "../components/SEO";
import api from "../lib/apiClient";

type BlogChild = {
  id: string;
  title: string;
  slug: string;
  summary?: string;
  coverImageUrl?: string;
  publishedAt?: string;
  authorName?: string;
};

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  publishedAt?: string;
  authorName?: string;
  isPillar?: boolean;
  pillarId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  pillar?: { id: string; title: string; slug: string } | null;
  children?: BlogChild[];
};

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<BlogPost | null>(null);

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get<BlogPost>(`/blogs/${slug}`);
        if (!mounted) return;
        setPost(data ?? null);
      } catch {
        if (!mounted) return;
        setPost(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="h-64 rounded-2xl bg-slate-50 animate-pulse" />
      </main>
    );
  }

  if (!post) {
    return (
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="rounded-xl border bg-white p-6 text-slate-600">
          Blog post not found.
        </div>
        <Link to="/blogs" className="mt-4 inline-block text-sm text-ocean-700 hover:underline">
          Back to all posts
        </Link>
      </main>
    );
  }

  // Article Schema for blog post
  const articleSchema = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.seoTitle || post.title,
        description: post.seoDescription || post.summary || post.content.substring(0, 200),
        image: post.coverImageUrl || undefined,
        datePublished: post.publishedAt || undefined,
        author: {
          '@type': 'Person',
          name: post.authorName || 'Tunect Team',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Tunect',
          logo: {
            '@type': 'ImageObject',
            url: 'https://tunectnow.com/tunect_logo_hd.png',
          },
        },
      }
    : null;

  const seoTitle = post?.seoTitle || post?.title || 'Tunect Blog';
  const seoDesc = post?.seoDescription || post?.summary || post?.content.substring(0, 160) || 'Read this article on Tunect Blog';

  return (
    <main className="container mx-auto px-4 py-12 max-w-3xl">
      {post && (
        <SEO
          title={`${seoTitle} | Tunect Blog`}
          description={seoDesc}
          url={`/blogs/${post.slug}`}
          image={post.coverImageUrl}
          type="article"
          structuredData={articleSchema || undefined}
        />
      )}
      <Link to="/blogs" className="text-sm text-ocean-700 hover:underline">
        ← Back to all posts
      </Link>

      {/* Supporting blog → link back to pillar */}
      {post.pillar && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm text-indigo-800">
            Part of the guide:{' '}
            <Link
              to={`/blogs/${post.pillar.slug}`}
              className="font-semibold text-indigo-700 hover:underline"
            >
              {post.pillar.title}
            </Link>
          </p>
        </div>
      )}

      <div className="mt-6 rounded-2xl border bg-white shadow-sm overflow-hidden">
        {post.coverImageUrl ? (
          <img
            src={post.coverImageUrl}
            alt={post.title}
            className="h-64 w-full object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="p-6 sm:p-8">
          <div className="text-xs text-slate-500">
            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "Draft"}
          </div>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{post.title}</h1>
          <div className="mt-2 text-sm text-slate-500">
            {post.authorName ? `By ${post.authorName}` : "Tunect Team"}
          </div>
          {post.summary ? (
            <p className="mt-4 text-slate-700 font-medium">{post.summary}</p>
          ) : null}
          <div className="prose prose-slate mt-6 max-w-none"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </div>
      </div>

      {/* Pillar page → show related guides */}
      {post.isPillar && post.children && post.children.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Related Guides</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {post.children.map((child) => (
              <Link
                key={child.id}
                to={`/blogs/${child.slug}`}
                className="group rounded-xl border bg-white shadow-sm hover:shadow-md transition overflow-hidden"
              >
                {child.coverImageUrl ? (
                  <img
                    src={child.coverImageUrl}
                    alt={child.title}
                    className="h-32 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-32 w-full bg-slate-100" />
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 group-hover:text-ocean-700">
                    {child.title}
                  </h3>
                  {child.summary && (
                    <p className="mt-1 text-sm text-slate-600 line-clamp-2">{child.summary}</p>
                  )}
                  <div className="mt-2 text-xs text-slate-500">
                    {child.publishedAt ? new Date(child.publishedAt).toLocaleDateString() : ''}
                    {child.authorName ? ` · ${child.authorName}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Supporting blog → bottom link back to pillar */}
      {post.pillar && (
        <div className="mt-8 text-center">
          <Link
            to={`/blogs/${post.pillar.slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900 transition-colors"
          >
            ← Read the full guide: {post.pillar.title}
          </Link>
        </div>
      )}
    </main>
  );
}
