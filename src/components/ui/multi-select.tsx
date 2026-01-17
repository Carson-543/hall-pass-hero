import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

export type Option = {
    label: string
    value: string
}

interface MultiSelectProps {
    options: Option[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    className?: string
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Select options...",
    className,
}: MultiSelectProps) {
    const [open, setOpen] = React.useState(false)

    const handleUnselect = (item: string) => {
        onChange(selected.filter((i) => i !== item))
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between h-auto min-h-10 hover:bg-white/5 bg-white/5 border-white/10 text-white",
                        className
                    )}
                >
                    <div className="flex gap-1 flex-wrap">
                        {selected.length === 0 && <span className="text-slate-400 font-normal">{placeholder}</span>}
                        {selected.length > 0 && selected.length <= 2 ? (
                            selected.map((item) => (
                                <Badge
                                    variant="secondary"
                                    key={item}
                                    className="mr-1 mb-1 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border-blue-500/20"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleUnselect(item)
                                    }}
                                >
                                    {options.find((option) => option.value === item)?.label}
                                    <button
                                        className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                handleUnselect(item)
                                            }
                                        }}
                                        onMouseDown={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                        }}
                                        onClick={() => handleUnselect(item)}
                                    >
                                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                    </button>
                                </Badge>
                            ))
                        ) : selected.length > 2 && (
                            <div className="flex items-center gap-1">
                                <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/20">
                                    {selected.length} selected
                                </Badge>
                            </div>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0 bg-slate-950 border-white/10 text-white">
                <Command className="bg-slate-950">
                    {/* <CommandInput placeholder="Search..." className="text-white" /> */}
                    {/* Removed search input for cleanliness as we have few statuses */}
                    <div className="p-2">
                        <CommandList>
                            {/* <CommandEmpty>No item found.</CommandEmpty> */}
                            <CommandGroup>
                                {options.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        onSelect={() => {
                                            onChange(
                                                selected.includes(option.value)
                                                    ? selected.filter((item) => item !== option.value)
                                                    : [...selected, option.value]
                                            )
                                        }}
                                        className="cursor-pointer aria-selected:bg-white/10 text-white"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selected.includes(option.value) ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {option.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </div>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
