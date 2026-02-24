import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { BlogStatus } from '@prisma/client';

@Injectable()
export class BlogsService {
  constructor(private prisma: PrismaService) {}

  private slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }

  async listPublic(page = 1, pageSize = 10) {
    const take = Math.max(1, Math.min(pageSize, 20));
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        where: { status: BlogStatus.PUBLISHED },
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          coverImageUrl: true,
          publishedAt: true,
          authorName: true,
          isPillar: true,
          pillarId: true,
          seoTitle: true,
          seoDescription: true,
          pillar: {
            select: { id: true, title: true, slug: true },
          },
        },
      }),
      this.prisma.blogPost.count({ where: { status: BlogStatus.PUBLISHED } }),
    ]);

    return { items, meta: { page, pageSize: take, total } };
  }

  async getPublicBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: BlogStatus.PUBLISHED },
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        content: true,
        coverImageUrl: true,
        publishedAt: true,
        authorName: true,
        isPillar: true,
        pillarId: true,
        seoTitle: true,
        seoDescription: true,
        pillar: {
          select: { id: true, title: true, slug: true },
        },
        children: {
          where: { status: BlogStatus.PUBLISHED },
          orderBy: { publishedAt: 'desc' },
          select: {
            id: true,
            title: true,
            slug: true,
            summary: true,
            coverImageUrl: true,
            publishedAt: true,
            authorName: true,
          },
        },
      },
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return post;
  }

  /** List all pillar pages (for admin dropdown) */
  async listPillars() {
    return this.prisma.blogPost.findMany({
      where: { isPillar: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
      },
    });
  }

  async listAdmin(page = 1, pageSize = 20) {
    const take = Math.max(1, Math.min(pageSize, 50));
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.blogPost.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          content: true,
          coverImageUrl: true,
          status: true,
          publishedAt: true,
          authorName: true,
          isPillar: true,
          pillarId: true,
          seoTitle: true,
          seoDescription: true,
          createdAt: true,
          updatedAt: true,
          pillar: {
            select: { id: true, title: true, slug: true },
          },
          _count: { select: { children: true } },
        },
      }),
      this.prisma.blogPost.count(),
    ]);
    return { items, meta: { page, pageSize: take, total } };
  }

  async create(dto: CreateBlogDto) {
    const slug = (dto.slug || this.slugify(dto.title)).trim();
    if (!slug) throw new BadRequestException('Slug is required');

    // If it's a pillar page, it can't have a pillarId
    const isPillar = dto.isPillar ?? false;
    const pillarId = isPillar ? null : (dto.pillarId || null);

    // Validate pillarId if provided
    if (pillarId) {
      const parent = await this.prisma.blogPost.findUnique({
        where: { id: pillarId },
        select: { isPillar: true },
      });
      if (!parent || !parent.isPillar) {
        throw new BadRequestException('Selected pillar page does not exist or is not a pillar');
      }
    }

    return this.prisma.blogPost.create({
      data: {
        title: dto.title.trim(),
        slug,
        summary: dto.summary?.trim(),
        content: dto.content,
        coverImageUrl: dto.coverImageUrl?.trim(),
        status: dto.status ?? BlogStatus.DRAFT,
        authorName: dto.authorName?.trim(),
        publishedAt: dto.status === BlogStatus.PUBLISHED ? new Date() : null,
        isPillar,
        pillarId,
        seoTitle: dto.seoTitle?.trim(),
        seoDescription: dto.seoDescription?.trim(),
      },
    });
  }

  async update(id: string, dto: UpdateBlogDto) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Blog post not found');

    const slug = dto.slug ? dto.slug.trim() : dto.title ? this.slugify(dto.title) : undefined;

    const status = dto.status ?? existing.status;
    const publishedAt =
      status === BlogStatus.PUBLISHED
        ? existing.publishedAt ?? new Date()
        : null;

    const isPillar = dto.isPillar ?? existing.isPillar;
    let pillarId: string | null | undefined = dto.pillarId;
    // If switching to pillar, clear pillarId
    if (isPillar) {
      pillarId = null;
    }
    // If pillarId is explicitly set, validate it
    if (pillarId) {
      const parent = await this.prisma.blogPost.findUnique({
        where: { id: pillarId },
        select: { isPillar: true },
      });
      if (!parent || !parent.isPillar) {
        throw new BadRequestException('Selected pillar page does not exist or is not a pillar');
      }
    }

    return this.prisma.blogPost.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        slug,
        summary: dto.summary?.trim(),
        content: dto.content,
        coverImageUrl: dto.coverImageUrl?.trim(),
        status,
        authorName: dto.authorName?.trim(),
        publishedAt,
        isPillar,
        pillarId: pillarId === undefined ? undefined : pillarId,
        seoTitle: dto.seoTitle?.trim(),
        seoDescription: dto.seoDescription?.trim(),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Blog post not found');

    // If it's a pillar, unlink all children first
    if (existing.isPillar) {
      await this.prisma.blogPost.updateMany({
        where: { pillarId: id },
        data: { pillarId: null },
      });
    }

    await this.prisma.blogPost.delete({ where: { id } });
    return { ok: true };
  }
}
