import test from 'node:test';
import assert from 'node:assert/strict';
import { runAndroidTool } from './mcp-extension.js';

test('MCP adapter preserves Android queue protocol and result', async () => {
  const calls=[];
  const expected={content:[{type:'text',text:'test-result'}]};
  let jobId;
  const db={
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({sql,args});
          if(sql.startsWith('INSERT')) jobId=args[0];
          return {
            async run(){return {success:true}},
            async first(){return {status:'done',result:JSON.stringify({jsonrpc:'2.0',id:jobId,result:expected}),expires_at:Date.now()+10000}},
          };
        },
      };
    },
  };
  const result=await runAndroidTool({ROUTER_DB:db},'list_chats',{limit:2});
  assert.deepEqual(result,expected);
  assert.match(calls[0].sql,/INSERT INTO jobs/);
  assert.equal(calls[0].args[1],'list_chats');
  assert.deepEqual(JSON.parse(calls[0].args[2]),{limit:2});
  assert.match(calls[1].sql,/SELECT status,result,expires_at/);
});
