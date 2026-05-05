# Viewer Med static build

Архив `viewer-medfull-static-build-2026-05-05-fixed2.zip` содержит готовую статическую сборку viewer.

## Как развернуть

1. Распаковать архив.
2. Раздать содержимое папки `dist` любым статическим web-сервером: nginx, IIS, Apache, встроенный web-server МИС.
3. Открывать viewer ссылкой:

```text
https://viewer.local/?manifestUrl=https%3A%2F%2Fmis-gateway.local%2Fstudies%2F242746744%2Fmanifest.json
```

или старым совместимым способом:

```text
https://viewer.local/?data=<base64url-json>
```

## Важно

Viewer работает в браузере и не требует Node.js на сервере после сборки.

Запуск без параметров открывает demo-сцену из файлов `liver.stl` и `tumor.stl`. Сборка использует относительные пути, поэтому ее можно раздавать из подпапки web-сервера.

UNC-пути вида `\\10.88.250.12\gynMRT\242746744\` браузер напрямую не читает. МИС/gateway должен отдать модели как HTTP/HTTPS URL в `models[].url`.
