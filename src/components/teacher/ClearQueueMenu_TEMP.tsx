const ClearQueueMenu = ({ onClear }: { onClear: (active: boolean, pending: boolean) => void }) => {
    const [clearActive, setClearActive] = useState(true);
    const [clearPending, setClearPending] = useState(true);
    const [open, setOpen] = useState(false);

    const handleClear = () => {
        onClear(clearActive, clearPending);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="h-10 w-10 p-0 rounded-full border-2 border-white/20 bg-white/10 hover:bg-white/15 hover:border-red-400/50 text-slate-400 hover:text-red-400 transition-all shadow-lg"
                    title="Clear Queue"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 rounded-[1.5rem] bg-slate-900 border-white/20 text-white shadow-2xl p-0 overflow-hidden" align="end">
                <div className="p-4 border-b border-white/10 bg-slate-900/50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl border bg-red-500/20 border-red-500/30">
                            <Trash2 className="w-5 h-5 text-red-500" />
                        </div>
                        <div>
                            <h4 className="font-black text-white text-sm uppercase tracking-wide">Clear Queue</h4>
                            <p className="text-[10px] font-bold text-slate-400">Select items to remove</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-6">
                    {/* Active Passes Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-white">Active Passes</Label>
                            <p className="text-[10px] font-medium text-slate-400">Includes pending returns</p>
                        </div>
                        <Switch
                            checked={clearActive}
                            onCheckedChange={setClearActive}
                            className="data-[state=checked]:bg-red-600"
                        />
                    </div>

                    {/* Pending Requests Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-bold text-white">Pending Requests</Label>
                            <p className="text-[10px] font-medium text-slate-400">Deny all waiting students</p>
                        </div>
                        <Switch
                            checked={clearPending}
                            onCheckedChange={setClearPending}
                            className="data-[state=checked]:bg-red-600"
                        />
                    </div>

                    <Button
                        onClick={handleClear}
                        disabled={!clearActive && !clearPending}
                        className="w-full font-bold rounded-xl h-10 shadow-lg bg-red-600 hover:bg-red-700 text-white shadow-red-500/20"
                    >
                        Clear Selected
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
