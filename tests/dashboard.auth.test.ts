import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthorized } from "../src/services/dashboardAuth.service.js";

const TOKEN = "geheimes-test-token";

test("isAuthorized: true bei korrektem Bearer-Token", () => {
  assert.equal(isAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
});

test("isAuthorized: false ohne Authorization-Header", () => {
  assert.equal(isAuthorized(undefined, TOKEN), false);
});

test("isAuthorized: false bei falschem Token", () => {
  assert.equal(isAuthorized("Bearer falsches-token", TOKEN), false);
});

test("isAuthorized: false bei fehlendem 'Bearer'-Schema", () => {
  assert.equal(isAuthorized(TOKEN, TOKEN), false);
});

test("isAuthorized: false bei leerem Header", () => {
  assert.equal(isAuthorized("", TOKEN), false);
});
