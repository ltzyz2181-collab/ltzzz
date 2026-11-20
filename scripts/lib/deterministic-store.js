```javascript
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH = './data/records.json';

function loadRecords() {
  if (!fs.existsSync(STORE_PATH)) return [];
  const data = fs.readFileSync(STORE_PATH, 'utf-8');
  return JSON.parse(data);
}

function saveRecords(records) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

function addRecord(record) {
  if (!record.source_url || !record.retrieved_at || !record.content_sha256 || !record.parser_version || record.uncertainty === undefined) {
    throw new Error('Missing required fields in the record.');
  }

  if (isPrivateSource(record.source_url)) {
    throw new Error('Private source URL is not allowed.');
  }

  const records = loadRecords();
  const existingRecord = records.find(r => r.source_url === record.source_url);

  if (existingRecord && existingRecord.content_sha256 !== record.content_sha256) {
    // Content has changed, update the record
    const index = records.indexOf(existingRecord);
    records[index] = record;
  } else if (!existingRecord) {
    // New record, append it
    records.push(record);
  }

  saveRecords(records);
}

function getRecords() {
  return loadRecords();
}

function hasURL(source_url) {
  const records = loadRecords();
  return records.some(r => r.source_url === source_url);
}

function getByURL(source_url) {
  const records = loadRecords();
  return records.find(r => r.source_url === source_url) || null;
}

function isPrivateSource(url) {
  // Implement your logic to determine if a source is private
  // For example, check if the URL is from a known public domain
  const publicDomains = ['example.com', 'publicdomain.org'];
  const domain = new URL(url).hostname;
  return !publicDomains.includes(domain);
}

module.exports = { addRecord, getRecords, hasURL, getByURL };
```