const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBookings() {
  try {
    // First, find the tutor by email
    const tutor = await prisma.tutor.findFirst({
      where: { user: { email: 'nabil.irshad07@gmail.com' } },
      include: { user: true }
    });
    
    console.log('Tutor found:', tutor ? `ID: ${tutor.id}, Email: ${tutor.user.email}` : 'NOT FOUND');
    
    if (!tutor) {
      console.log('No tutor found with that email!');
      await prisma.$disconnect();
      return;
    }
    
    // Get all bookings for this tutor
    const allBookings = await prisma.booking.findMany({
      where: { tutorId: tutor.id },
      include: {
        student: { include: { user: true } },
        tutor: { include: { user: true } }
      }
    });
    
    console.log('\n=== ALL BOOKINGS FOR THIS TUTOR ===');
    console.log('Total bookings:', allBookings.length);
    
    allBookings.forEach((b, i) => {
      console.log(`\nBooking ${i + 1}:`);
      console.log('  ID:', b.id);
      console.log('  Status:', b.status);
      console.log('  isDemo:', b.isDemo);
      console.log('  startTime:', b.startTime);
      console.log('  endTime:', b.endTime);
      console.log('  Student:', b.student?.user?.email || 'N/A');
      console.log('  Created:', b.createdAt);
    });
    
    // Get bookings that match the query conditions
    const matchingBookings = await prisma.booking.findMany({
      where: {
        tutorId: tutor.id,
        startTime: { not: null },
        endTime: { not: null },
        status: { notIn: ['CANCELED'] }
      },
      include: {
        student: { include: { user: true } },
        tutor: { select: { subjects: true } }
      }
    });
    
    console.log('\n=== BOOKINGS MATCHING QUERY CONDITIONS ===');
    console.log('Matching bookings:', matchingBookings.length);
    matchingBookings.forEach((b, i) => {
      console.log(`\nMatch ${i + 1}:`);
      console.log('  ID:', b.id);
      console.log('  Status:', b.status);
      console.log('  Student:', b.student?.user?.email);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBookings();
