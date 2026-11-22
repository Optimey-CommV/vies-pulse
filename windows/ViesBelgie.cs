// SPDX-FileCopyrightText: 2026 Optimey CommV
// SPDX-License-Identifier: GPL-3.0-or-later

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("VIES Belgie status")]
[assembly: System.Reflection.AssemblyProduct("VIES Belgie status")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

namespace ViesBelgie
{
    enum Status { Onbekend, Online, Offline, Fout }

    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main()
        {
            try { SetProcessDPIAware(); } catch { }
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // TLS 1.2
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new StatusForm());
        }
    }

    class DotPanel : Panel
    {
        public Color Kleur = Color.Gray;
        public bool Aan = true;

        public DotPanel()
        {
            DoubleBuffered = true;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            int d = Math.Min(Width, Height) - 4;
            var r = new Rectangle((Width - d) / 2, (Height - d) / 2, d, d);
            Color c = Aan ? Kleur : Donker(Kleur);
            using (var b = new SolidBrush(c)) g.FillEllipse(b, r);
            if (Aan)
            {
                var glans = new Rectangle(r.X + d / 5, r.Y + d / 6, d / 3, d / 4);
                using (var b = new SolidBrush(Color.FromArgb(110, Color.White))) g.FillEllipse(b, glans);
            }
            using (var p = new Pen(Color.FromArgb(90, Color.Black), 1.5f)) g.DrawEllipse(p, r);
        }

        static Color Donker(Color c)
        {
            return Color.FromArgb(c.R / 4 + 40, c.G / 4 + 40, c.B / 4 + 40);
        }
    }

    class StatusForm : Form
    {
        const string StatusUrl = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-status";
        const int PollSeconden = 60;

        readonly DotPanel dot = new DotPanel();
        readonly Label lblStatus = new Label();
        readonly Label lblTijd = new Label();
        readonly Timer blinkTimer = new Timer();
        readonly Timer pollTimer = new Timer();
        readonly NotifyIcon tray = new NotifyIcon();
        readonly ToolStripMenuItem menuBovenaan = new ToolStripMenuItem("Altijd bovenaan");

        Status status = Status.Onbekend;
        bool bezig;
        Icon huidigIcoon;

        [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr handle);

        public StatusForm()
        {
            Text = "VIES België";
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.Manual;
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(330, 96);
            BackColor = Color.White;
            TopMost = true;

            var wa = Screen.PrimaryScreen.WorkingArea;
            Location = new Point(wa.Right - Width - 20, wa.Bottom - Height - 20);

            dot.SetBounds(14, 18, 56, 56);

            lblStatus.SetBounds(82, 16, 240, 30);
            lblStatus.Font = new Font("Segoe UI", 13f, FontStyle.Bold);
            lblStatus.Text = "Controleren...";

            lblTijd.SetBounds(84, 50, 240, 36);
            lblTijd.Font = new Font("Segoe UI", 8.5f);
            lblTijd.ForeColor = Color.DimGray;
            lblTijd.Text = "Nog geen controle uitgevoerd";

            Controls.Add(dot);
            Controls.Add(lblStatus);
            Controls.Add(lblTijd);

            var menu = new ContextMenuStrip();
            var nu = new ToolStripMenuItem("Nu controleren", null, delegate { Controleer(); });
            menuBovenaan.Checked = true;
            menuBovenaan.Click += delegate { TopMost = !TopMost; menuBovenaan.Checked = TopMost; };
            var toon = new ToolStripMenuItem("Venster tonen", null, delegate { ToonVenster(); });
            var stop = new ToolStripMenuItem("Afsluiten", null, delegate { Close(); });
            menu.Items.AddRange(new ToolStripItem[] { nu, menuBovenaan, toon, new ToolStripSeparator(), stop });
            ContextMenuStrip = menu;

            tray.ContextMenuStrip = menu;
            tray.Text = "VIES België";
            tray.Visible = true;
            tray.DoubleClick += delegate { ToonVenster(); };
            ZetIcoon(Color.Gray);

            blinkTimer.Interval = 500;
            blinkTimer.Tick += delegate
            {
                bool aan = status == Status.Offline ? !dot.Aan : true;
                if (aan != dot.Aan) { dot.Aan = aan; dot.Invalidate(); }
            };
            blinkTimer.Start();

            pollTimer.Interval = PollSeconden * 1000;
            pollTimer.Tick += delegate { Controleer(); };
            pollTimer.Start();

            Shown += delegate { Controleer(); };
        }

        void ToonVenster()
        {
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        async void Controleer()
        {
            if (bezig) return;
            bezig = true;
            Status nieuw;
            string foutTekst = null;
            try
            {
                string json = await Task.Run(() => Haal());
                nieuw = Parse(json);
            }
            catch (Exception ex)
            {
                nieuw = Status.Fout;
                foutTekst = ex.Message;
            }
            finally { bezig = false; }

            Toon(nieuw, foutTekst);
        }

        static string Haal()
        {
            using (var wc = new WebClient())
            {
                wc.Headers[HttpRequestHeader.UserAgent] = "ViesBelgieStatus/1.0";
                wc.Headers[HttpRequestHeader.Accept] = "application/json";
                wc.Encoding = System.Text.Encoding.UTF8;
                return wc.DownloadString(StatusUrl);
            }
        }

        internal static Status Parse(string json)
        {
            var m = Regex.Match(json,
                "\"countryCode\"\\s*:\\s*\"BE\"\\s*,\\s*\"availability\"\\s*:\\s*\"([A-Za-z_]+)\"");
            if (!m.Success) throw new Exception("Status voor België niet gevonden in het antwoord");
            return m.Groups[1].Value.Equals("Available", StringComparison.OrdinalIgnoreCase)
                ? Status.Online : Status.Offline;
        }

        void Toon(Status nieuw, string fout)
        {
            Status oud = status;
            status = nieuw;
            string tijd = DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss");

            switch (nieuw)
            {
                case Status.Online:
                    dot.Kleur = Color.FromArgb(30, 190, 60);
                    lblStatus.Text = "Online";
                    lblStatus.ForeColor = Color.FromArgb(20, 140, 45);
                    lblTijd.Text = "Btw-nummers valideren werkt.\nLaatste controle: " + tijd;
                    break;
                case Status.Offline:
                    dot.Kleur = Color.FromArgb(225, 35, 35);
                    lblStatus.Text = "Niet beschikbaar";
                    lblStatus.ForeColor = Color.FromArgb(185, 25, 25);
                    lblTijd.Text = "Belgisch luik van VIES ligt plat.\nLaatste controle: " + tijd;
                    break;
                default:
                    dot.Kleur = Color.FromArgb(240, 160, 20);
                    lblStatus.Text = "Kan niet controleren";
                    lblStatus.ForeColor = Color.FromArgb(180, 110, 0);
                    lblTijd.Text = "Statuspagina niet bereikbaar.\nLaatste poging: " + tijd;
                    break;
            }
            dot.Invalidate();
            ZetIcoon(dot.Kleur);
            tray.Text = "VIES België: " + lblStatus.Text;

            if (nieuw == Status.Online && oud != Status.Online && oud != Status.Onbekend)
            {
                System.Media.SystemSounds.Asterisk.Play();
                tray.ShowBalloonTip(10000, "VIES België is terug online",
                    "Btw-nummers valideren werkt weer.", ToolTipIcon.Info);
            }
        }

        void ZetIcoon(Color kleur)
        {
            using (var bmp = new Bitmap(32, 32))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    using (var b = new SolidBrush(kleur)) g.FillEllipse(b, 3, 3, 26, 26);
                    using (var p = new Pen(Color.FromArgb(120, Color.Black), 1.5f)) g.DrawEllipse(p, 3, 3, 26, 26);
                }
                IntPtr h = bmp.GetHicon();
                Icon nieuw = Icon.FromHandle(h);
                tray.Icon = nieuw;
                Icon = nieuw;
                if (huidigIcoon != null)
                {
                    DestroyIcon(huidigIcoon.Handle);
                    huidigIcoon.Dispose();
                }
                huidigIcoon = nieuw;
            }
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (WindowState == FormWindowState.Minimized) Hide();
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            tray.Visible = false;
            tray.Dispose();
            base.OnFormClosed(e);
        }
    }
}
