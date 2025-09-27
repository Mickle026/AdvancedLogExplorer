using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Controller.Plugins;
using MediaBrowser.Model.Serialization;
using MediaBrowser.Model.Logging;
using System;
using System.Collections.Generic;
using System.Xml.Serialization;
using MediaBrowser.Model.Drawing;
using System.IO;

namespace AdvancedLogExplorer
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages,IHasThumbImage
    {
        public override string Name => "Advanced Log Explorer";
        public override Guid Id => new Guid("78baf3a0-4c3a-44a8-9015-02843a37decd");
        public override string Description =>
            "Desktop-class log viewer with filters, presets, search, highlighting, tail mode, export, and split-view.";
        public static Plugin? Instance { get; private set; }

        public Plugin(IApplicationPaths appPaths, IXmlSerializer xmlSerializer, ILogManager logManager)
            : base(appPaths, xmlSerializer) { }

        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name = "advancedlogexplorer",
                    EmbeddedResourcePath = GetType().Namespace + ".Web.advancedlogexplorer.html",
                    EnableInMainMenu = true,       // visible in admin System menu
                    MenuSection = "server",        // System tab
                    DisplayName = "Advanced Log Explorer"
                },
                new PluginPageInfo
                {
                    Name = "advancedlogexplorerjs",
                    EmbeddedResourcePath = GetType().Namespace + ".Web.advancedlogexplorer.js"
                }
            };
        }

        // --- Thumbnail icon ---
        public Stream GetThumbImage()
        {
            var type = this.GetType();
            return type.Assembly.GetManifestResourceStream(type.Namespace + ".logo.png");
        }

        public ImageFormat ThumbImageFormat => ImageFormat.Png;
    }
    public class PluginConfiguration : BasePluginConfiguration
    {

    }
}

