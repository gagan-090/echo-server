import { getMessages } from './src/services/message.service.js';

async function test() {
  const convId = '2b41cfe6-7b9f-4f6b-a46a-d4c4a8ee7bc2'; // from previous run
  const userId = '5a3cd0f9-48c6-42f8-9670-3dc7532e9ce9'; // Gagan's user_id from previous run

  try {
    const result = await getMessages(convId, null, 5, userId);
    console.log('Resulting messages:');
    result.messages.forEach(m => {
      console.log(`Msg: ${m.content}, sender: ${m.sender_id}, status: ${m.status}`);
    });
  } catch (err) {
    console.error(err);
  }
}

test();
