// Quick test to verify node-ical import and usage
import { parseICS } from 'node-ical';

const testIcal = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:test-event-1
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
SUMMARY:Test Event
END:VEVENT
END:VCALENDAR`;

try {
  console.log('Testing parseICS function...');
  const result = parseICS(testIcal);
  console.log('Success! Parsed events:', Object.keys(result));
  console.log('First event:', result[Object.keys(result)[0]]);
} catch (error) {
  console.error('Error:', error.message);
}