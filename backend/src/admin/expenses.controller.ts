import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Decimal } from '@prisma/client/runtime/library';

@ApiTags('Admin Expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/expenses')
export class ExpensesController {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  @ApiOperation({ summary: 'List expenses (newest first, optional filters)' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM format' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @Get()
  async list(
    @Query('month') month?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pg = Math.max(Number(page ?? 1), 1);
    const ps = Math.min(Math.max(Number(pageSize ?? 50), 1), 200);

    const where: any = {};
    if (category) where.category = category;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      if (y && m) {
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        where.expenseDate = { gte: start, lt: end };
      }
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: (pg - 1) * ps,
        take: ps,
      }),
      this.prisma.expense.count({ where }),
    ]);

    // Total for the filtered period
    const agg = await this.prisma.expense.aggregate({
      where,
      _sum: { amount: true },
    });

    // Generate presigned URLs for receipts
    const expensesWithUrls = await Promise.all(
      expenses.map(async (e) => {
        let signedReceiptUrl: string | null = null;
        if (e.receiptUrl) {
          try {
            signedReceiptUrl = await this.s3.getPresignedUrl(e.receiptUrl, 3600);
          } catch {
            signedReceiptUrl = e.receiptUrl;
          }
        }
        return {
          ...e,
          amount: Number(e.amount),
          receiptUrl: signedReceiptUrl,
        };
      }),
    );

    return {
      expenses: expensesWithUrls,
      total,
      totalAmount: Number(agg._sum.amount ?? 0),
      page: pg,
      pageSize: ps,
    };
  }

  @ApiOperation({ summary: 'Create an expense entry' })
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('receipt', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Only JPEG, PNG, WebP, or PDF files are allowed'), false);
      }
    },
  }))
  async create(
    @Body() dto: { title: string; description?: string; amount: string; category?: string; expenseDate?: string },
    @CurrentUser('sub') userId: string,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    const amount = parseFloat(dto.amount);
    if (!amount || amount <= 0) throw new BadRequestException('Invalid amount');
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');

    let receiptUrl: string | null = null;
    if (receipt) {
      receiptUrl = await this.s3.uploadFile(receipt.buffer, receipt.originalname, 'expenses');
    }

    const expense = await this.prisma.expense.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        amount: new Decimal(amount),
        category: dto.category?.trim() || 'general',
        receiptUrl,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
        createdBy: userId,
      },
    });

    return { ...expense, amount: Number(expense.amount) };
  }

  @ApiOperation({ summary: 'Update an expense entry' })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: { title?: string; description?: string; amount?: number; category?: string; expenseDate?: string },
  ) {
    const data: any = {};
    if (dto.title) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.amount !== undefined) data.amount = new Decimal(dto.amount);
    if (dto.category) data.category = dto.category.trim();
    if (dto.expenseDate) data.expenseDate = new Date(dto.expenseDate);

    const expense = await this.prisma.expense.update({ where: { id }, data });
    return { ...expense, amount: Number(expense.amount) };
  }

  @ApiOperation({ summary: 'Delete an expense entry' })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.expense.delete({ where: { id } });
    return { success: true };
  }

  @ApiOperation({ summary: 'Export expenses as CSV (Excel-compatible)' })
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('month') month?: string,
    @Query('category') category?: string,
  ) {
    const where: any = {};
    if (category) where.category = category;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      if (y && m) {
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        where.expenseDate = { gte: start, lt: end };
      }
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { expenseDate: 'desc' },
    });

    // Build CSV
    const header = 'Date,Title,Category,Amount (₹),Description\n';
    const rows = expenses.map(e => {
      const date = e.expenseDate.toISOString().split('T')[0];
      const title = `"${(e.title || '').replace(/"/g, '""')}"`;
      const cat = `"${(e.category || '').replace(/"/g, '""')}"`;
      const amount = Number(e.amount).toFixed(2);
      const desc = `"${(e.description || '').replace(/"/g, '""')}"`;
      return `${date},${title},${cat},${amount},${desc}`;
    }).join('\n');

    const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalRow = `\nTotal,,,${totalAmount.toFixed(2)},`;

    const csv = header + rows + totalRow;
    const filename = `expenses${month ? `-${month}` : ''}.csv`;

    res.header('Content-Type', 'text/csv; charset=utf-8');
    // BOM for Excel to detect UTF-8
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  }

  @ApiOperation({ summary: 'Get expense categories' })
  @Get('categories')
  async categories() {
    const rows = await this.prisma.expense.groupBy({
      by: ['category'],
      _count: true,
    });
    return rows.map(r => ({ name: r.category, count: r._count }));
  }
}
