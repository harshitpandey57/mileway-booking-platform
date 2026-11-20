import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Booking } from './models';
import { HttpError } from '../core';
import { printField } from './ticket-fonts';

const journeyTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata'
});
const rupees = (amount: number) => 'INR ' + amount.toLocaleString('en-IN');

export async function ticketPdf(userId: string, bookingId: string) {
  const booking = await Booking.findOne({ _id: bookingId, userId }).lean();
  if (!booking) throw new HttpError(404, 'Booking not found');
  if (booking.status !== 'confirmed' || booking.paymentStatus !== 'paid') throw new HttpError(409, 'A confirmed booking is required to download a ticket');
  const verification = new URL('/verify/', process.env.PUBLIC_BASE_URL || 'http://localhost:3000');
  verification.searchParams.set('token', booking.verificationToken);
  const qr = await QRCode.toBuffer(verification.href, { width: 180, margin: 2, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({
    size: 'A4', margins: { top: 45, bottom: 45, left: 48, right: 48 },
    info: { Title: 'Mileway ticket ' + booking.reference, Author: 'Mileway' }
  });
  const bytes: Buffer[] = [];
  const buffer = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => bytes.push(chunk));
    doc.once('error', reject);
    doc.once('end', () => resolve(Buffer.concat(bytes)));
  });
  const width = 498;
  doc.fillColor('#183a35').font('Helvetica-Bold').fontSize(31).text('Mileway');
  doc.fontSize(10).font('Helvetica').text('DEMO E-TICKET   /   FICTIONAL INVENTORY');
  doc.moveDown(1.8).fontSize(21);
  printField(doc, booking.from + ' to ' + booking.to, 'Helvetica-Bold');
  doc.fontSize(11);
  printField(doc, booking.operatorName + '    |    ' + booking.busName);
  doc.moveDown().font('Helvetica-Bold').text('Booking ' + booking.reference);
  doc.font('Helvetica').text('Payment confirmed   |   ' + ({ demo: 'Simulated payment', razorpay: 'Razorpay Test Mode', coupon: 'Covered by coupon' }[booking.paymentMode || 'demo']));
  doc.moveDown();
  printField(doc, 'Board at ' + booking.boardingPoint, 'Helvetica-Bold');
  doc.font('Helvetica').text(journeyTime.format(booking.departureAt) + ' IST');
  doc.moveDown(0.5);
  printField(doc, 'Drop at ' + booking.droppingPoint, 'Helvetica-Bold');
  doc.font('Helvetica').text(journeyTime.format(booking.arrivalAt) + ' IST');
  doc.moveDown(1.3).font('Helvetica-Bold').text('Passengers');
  doc.moveDown(0.4).font('Helvetica');
  for (const passenger of booking.passengers) {
    printField(doc, 'Seat ' + passenger.seat + '    |    ' + passenger.name + '    |    Age ' + passenger.age);
  }
  doc.moveDown(1.3).font('Helvetica-Bold').text('Fare');
  doc.font('Helvetica').text('Seats ' + rupees(booking.subtotal) + '    |    Discount ' + rupees(booking.discount));
  doc.font('Helvetica-Bold').text('Total paid ' + rupees(booking.total));
  doc.moveDown(1.2);
  if (doc.y > 655) doc.addPage();
  const y = doc.y;
  doc.image(qr, 48, y, { width: 84, height: 84 });
  doc.font('Helvetica-Bold').fontSize(11).text('Verify this ticket', 147, y + 12, { width: width - 110 });
  doc.font('Helvetica').fontSize(10).text('Scan the QR code to check current booking status.', { width: width - 110 });
  doc.moveDown(0.4).fillColor('#9a4338').text('Fictional journey. This ticket is for demonstration only and cannot be used for travel.', { width: width - 110 });
  doc.end();
  return { bytes: await buffer, reference: booking.reference };
}
