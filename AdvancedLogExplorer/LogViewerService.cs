using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Services;
using MediaBrowser.Common.Configuration;     // IServerApplicationPaths
using MediaBrowser.Model.Serialization;      // IJsonSerializer
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.IO.Compression;
using MediaBrowser.Controller;

namespace AdvancedLogExplorer.Api
{
    [Route("/AdvancedLogExplorer/GetLogs", "GET")]
    [Authenticated(Roles = "Admin")]
    public class GetLogs : IReturn<List<string>> { }

    public class LogContentResponse
    {
        public string Content { get; set; } = "";
        public string? Raw { get; internal set; }
    }

    [Route("/AdvancedLogExplorer/GetLogContent", "GET")]
    [Authenticated(Roles = "Admin")]
    public class GetLogContent : IReturn<LogContentResponse>
    {
        public string? File { get; set; }
        public string? Keyword1 { get; set; }
        public string? Keyword2 { get; set; }
        public string? Operator { get; set; }
        public string? Preset { get; set; }
        public int? Lines { get; set; }
    }

    [Route("/AdvancedLogExplorer/GetPluginFilters", "GET")]
    [Authenticated(Roles = "Admin")]
    public class GetPluginFilters : IReturn<List<string>>
    {
        public string? File { get; set; }
    }

    [Route("/AdvancedLogExplorer/ExportSession", "POST")]
    [Authenticated(Roles = "Admin")]
    public class ExportSession : IReturn<byte[]>
    {
        public string? FileName { get; set; }
        public string? FilteredLog { get; set; }
        public string? RawLog { get; set; }
        public string? Keyword1 { get; set; }
        public string? Keyword2 { get; set; }
        public string? Operator { get; set; }
        public string? Preset { get; set; }
        public int LineLimit { get; set; }
        public bool AutoRefresh { get; set; }
        public bool IncludeRaw { get; set; }
        public bool CompressRaw { get; set; }
    }

    public class LogViewerService : IService
    {
        private readonly IServerApplicationPaths _appPaths;
        private readonly IJsonSerializer _json;

        private static readonly Regex TimestampRegex =
            new Regex(@"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}",
                      RegexOptions.Compiled);

        //private static readonly Regex PluginRegex =
        //    new Regex(@"Loaded plugin ([^,]+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex PluginRegex =
            new Regex(@"Info\s+App:\s+Loading\s+([^,]+),\s+Version=", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public LogViewerService(IServerApplicationPaths appPaths, IJsonSerializer json)
        {
            _appPaths = appPaths;
            _json = json;
        }

        private string[] SafeReadAllLines(string filePath)
        {
            try
            {
                using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                using (var sr = new StreamReader(fs, Encoding.UTF8))
                {
                    var list = new List<string>();
                    string? line;
                    while ((line = sr.ReadLine()) != null)
                    {
                        if (!string.IsNullOrWhiteSpace(line))
                        {
                            list.Add(line);
                        }
                    }
                    return list.ToArray();
                }
            }
            catch (IOException ex)
            {
                return new[] { $"[AdvancedLogExplorer] Could not read file {Path.GetFileName(filePath)}: {ex.Message}" };
            }
        }

        public object Get(GetLogs request)
        {
            var logDir = _appPaths.LogDirectoryPath;
            return Directory.GetFiles(logDir, "*.txt")
                .Select(Path.GetFileName)
                .OrderByDescending(x => x)
                .ToList();
        }

        public object Get(GetPluginFilters request)
        {
            if (string.IsNullOrEmpty(request.File))
                return new List<string>();

            var logDir = _appPaths.LogDirectoryPath;
            var filePath = Path.Combine(logDir, request.File);
            if (!File.Exists(filePath)) return new List<string>();

            var lines = SafeReadAllLines(filePath);
            var plugins = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var line in lines)
            {
                var match = PluginRegex.Match(line);
                if (match.Success)
                {
                    plugins.Add(match.Groups[1].Value.Trim());
                }
            }

            return plugins.OrderBy(x => x).ToList();
        }

        public object Get(GetLogContent request)
        {
            if (string.IsNullOrEmpty(request.File))
                return new LogContentResponse
                {
                    Content = "[AdvancedLogExplorer] No file specified.",
                    Raw = ""
                };

            var logDir = _appPaths.LogDirectoryPath;
            var filePath = Path.Combine(logDir, request.File);
            if (!File.Exists(filePath))
                return new LogContentResponse
                {
                    Content = $"[AdvancedLogExplorer] Log file not found: {request.File}"
                };

            var lines = SafeReadAllLines(filePath);

            // Tail mode
            if (request.Lines.HasValue && request.Lines.Value > 0 && request.Lines.Value < lines.Length)
            {
                lines = lines.Skip(lines.Length - request.Lines.Value).ToArray();
            }

            var entries = GroupEntries(lines);
            var rawText = string.Join(Environment.NewLine, entries);
            IEnumerable<string> filtered = entries;

            // Presets
            if (!string.IsNullOrEmpty(request.Preset))
            {
                var preset = request.Preset.ToLowerInvariant();

                switch (preset)
                {
                    case "exception":
                        filtered = filtered.Where(e => e.Contains("Exception", StringComparison.OrdinalIgnoreCase));
                        break;
                    case "playback":
                        filtered = filtered.Where(e => e.Contains("Playback", StringComparison.OrdinalIgnoreCase));
                        break;
                    case "transcode":
                        filtered = filtered.Where(e => e.Contains("Transcode", StringComparison.OrdinalIgnoreCase));
                        break;
                    case "network":
                        filtered = filtered.Where(e =>
                            e.Contains("Http", StringComparison.OrdinalIgnoreCase) ||
                            e.Contains("Socket", StringComparison.OrdinalIgnoreCase) ||
                            e.Contains("Network", StringComparison.OrdinalIgnoreCase));
                        break;
                    case "library":
                        filtered = filtered.Where(e => e.Contains("Library", StringComparison.OrdinalIgnoreCase));
                        break;
                    case "metadata":
                        filtered = filtered.Where(e =>
                            e.Contains("Provider", StringComparison.OrdinalIgnoreCase) ||
                            e.Contains("Metadata", StringComparison.OrdinalIgnoreCase));
                        break;
                    default:
                        if (preset.StartsWith("plugin:"))
                        {
                            var pluginName = preset.Substring(7);
                            filtered = filtered.Where(e => e.Contains(pluginName, StringComparison.OrdinalIgnoreCase));
                        }
                        break;
                }
            }

            // Keywords
            var k1 = request.Keyword1 ?? string.Empty;
            var k2 = request.Keyword2 ?? string.Empty;

            if (!string.IsNullOrEmpty(k1) || !string.IsNullOrEmpty(k2))
            {
                switch (request.Operator?.ToUpperInvariant())
                {
                    case "AND":
                        filtered = filtered.Where(e =>
                            e.Contains(k1, StringComparison.OrdinalIgnoreCase) &&
                            e.Contains(k2, StringComparison.OrdinalIgnoreCase));
                        break;
                    case "OR":
                        filtered = filtered.Where(e =>
                            e.Contains(k1, StringComparison.OrdinalIgnoreCase) ||
                            e.Contains(k2, StringComparison.OrdinalIgnoreCase));
                        break;
                    case "NOT":
                        if (!string.IsNullOrEmpty(k1) && !string.IsNullOrEmpty(k2))
                        {
                            filtered = filtered.Where(e =>
                                e.Contains(k1, StringComparison.OrdinalIgnoreCase) &&
                               !e.Contains(k2, StringComparison.OrdinalIgnoreCase));
                        }
                        break;
                    default: // NONE
                        if (!string.IsNullOrEmpty(k1))
                        {
                            filtered = filtered.Where(e =>
                                e.Contains(k1, StringComparison.OrdinalIgnoreCase));
                        }
                        break;
                }
            }

            return new LogContentResponse
        {
            Content = string.Join(Environment.NewLine + Environment.NewLine, filtered),
            Raw = rawText
        };
        }

        public object Post(ExportSession request)
        {
            using (var mem = new MemoryStream())
            {
                using (var archive = new ZipArchive(mem, ZipArchiveMode.Create, true))
                {
                    // Filtered log
                    var logEntry = archive.CreateEntry("filtered_log.txt");
                    using (var writer = new StreamWriter(logEntry.Open(), Encoding.UTF8))
                    {
                        writer.Write(request.FilteredLog ?? "");
                    }

                    // Raw log (optional + compress)
                    if (request.IncludeRaw && !string.IsNullOrEmpty(request.RawLog))
                    {
                        if (request.CompressRaw)
                        {
                            var rawEntry = archive.CreateEntry("raw_log.txt.gz");
                            using var entryStream = rawEntry.Open();
                            using var gzip = new GZipStream(entryStream, CompressionMode.Compress);
                            using var writer = new StreamWriter(gzip, Encoding.UTF8);
                            writer.Write(request.RawLog);
                        }
                        else
                        {
                            var rawEntry = archive.CreateEntry("raw_log.txt");
                            using var writer = new StreamWriter(rawEntry.Open(), Encoding.UTF8);
                            writer.Write(request.RawLog);
                        }
                    }

                    // Metadata
                    var sessionInfo = new
                    {
                        File = request.FileName,
                        request.Keyword1,
                        request.Keyword2,
                        request.Operator,
                        request.Preset,
                        request.LineLimit,
                        request.AutoRefresh,
                        request.IncludeRaw,
                        request.CompressRaw,
                        ExportedAt = DateTime.UtcNow
                    };

                    var metaEntry = archive.CreateEntry("session.json");
                    using var metaWriter = new StreamWriter(metaEntry.Open(), Encoding.UTF8);
                    metaWriter.Write(_json.SerializeToString(sessionInfo));
                }

                return mem.ToArray();
            }
        }

        private List<string> GroupEntries(string[] lines)
        {
            var entries = new List<string>();
            var currentEntry = new List<string>();

            foreach (var line in lines)
            {
                if (TimestampRegex.IsMatch(line))
                {
                    if (currentEntry.Count > 0)
                    {
                        entries.Add(string.Join(Environment.NewLine, currentEntry));
                        currentEntry.Clear();
                    }
                }
                currentEntry.Add(line);
            }

            if (currentEntry.Count > 0)
            {
                entries.Add(string.Join(Environment.NewLine, currentEntry));
            }

            return entries;
        }
    }
}
