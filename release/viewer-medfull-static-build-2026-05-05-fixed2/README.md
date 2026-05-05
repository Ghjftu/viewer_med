# Viewer Med

Веб-viewer для 3D-моделей исследования. Поддерживает загрузку `.stl`, `.obj`, `.ply`, измерения, заметки, сечения, скриншоты и сохранение состояния сцены.

## Интеграция с МИС

Рекомендуемая схема: МИС открывает viewer в браузере и передает короткую ссылку на HTTP manifest. UNC-путь вида `\\10.88.250.12\gynMRT\242746744\` должен читать backend/шлюз, потому что браузер не может надежно читать сетевые папки и писать в них напрямую.

Пример запуска viewer из МИС:

```text
https://viewer.local/?manifestUrl=https%3A%2F%2Fmis-gateway.local%2Fstudies%2F242746744%2Fmanifest.json
```

Manifest должен быть JSON:

```json
{
  "studyId": "242746744",
  "patient": "Иванов Петр Михайлович",
  "study": "МРТ чего-то там",
  "sourcePath": "\\\\10.88.250.12\\gynMRT\\242746744\\",
  "outputPath": "\\\\10.88.250.12\\gynMRT\\242746744\\",
  "artifactBaseUrl": "https://mis-gateway.local/studies/242746744/artifacts",
  "models": [
    {
      "url": "https://mis-gateway.local/studies/242746744/files/model.stl",
      "name": "Модель",
      "group": "МРТ чего-то там"
    }
  ]
}
```

`models[].url` должен быть HTTP/HTTPS URL конкретного файла, а не UNC-папка. Поддерживаемые форматы: `.stl`, `.obj`, `.ply`.

## Save-back API

Если в manifest есть `artifactBaseUrl`, viewer отправляет результаты в МИС. Если endpoint недоступен, viewer скачивает файл локально как fallback.

Ожидаемые endpoints:

```text
POST {artifactBaseUrl}/scene
POST {artifactBaseUrl}/measurements
POST {artifactBaseUrl}/screenshot
```

`scene` получает полный JSON состояния сцены: модели, камера, настройки, измерения, заметки и интеграционные поля `studyId`, `sourcePath`, `outputPath`, `artifactBaseUrl`, `manifestUrl`.

`measurements` получает JSON с замерами, заметками, пациентом и временем экспорта.

`screenshot` получает `multipart/form-data`:

```text
file: PNG
metadata: JSON string
```

## Пример gateway

В репозитории есть минимальный Node.js gateway без внешних зависимостей. Он:

- читает папку исследования;
- генерирует manifest;
- отдает модели по HTTP;
- сохраняет JSON/PNG обратно в папку исследования.

Запуск:

```bash
MIS_STUDIES_ROOT="\\\\10.88.250.12\\gynMRT" npm run gateway
```

Для локальной проверки можно положить файлы модели в папку `public/242746744` и открыть:

```text
http://localhost:5173/?manifestUrl=http%3A%2F%2Flocalhost%3A4174%2Fstudies%2F242746744%2Fmanifest.json
```

Дополнительные переменные:

```bash
MIS_GATEWAY_PORT=4174
MIS_GATEWAY_HOST=0.0.0.0
MIS_ARTIFACT_SUBDIR=""
```

Если `MIS_ARTIFACT_SUBDIR` пустой, артефакты сохраняются прямо в папку исследования.

## Старые режимы запуска

Они сохранены для совместимости:

- `?manifestUrl=...` или `?configUrl=...` - production manifest.
- `?data=...` - base64url JSON с `ViewerData`.
- `?fileUrl=...` - прямая ссылка на один файл модели.
- `#state=...` или `?state=...` - полное сохраненное состояние сцены.

## Разработка

```bash
npm run dev
npm run build
npm run lint
```
