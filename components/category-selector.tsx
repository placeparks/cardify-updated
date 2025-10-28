import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Check, ChevronsUpDown, X, Tags } from 'lucide-react'
import { cn } from '@/lib/utils'

export const CARD_CATEGORIES = [
  { value: 'mtg', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokemon' },
  { value: 'proxy', label: 'Proxy' },
  { value: 'token', label: 'Token' },
  { value: 'nft_linked', label: 'NFT Linked' },
  { value: 'anime', label: 'Anime' },
  { value: 'comic', label: 'Comic' },
  { value: 'realistic', label: 'Realistic' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'meme_parody', label: 'Meme/Parody' },
  { value: 'playable', label: 'Playable' },
  { value: 'commander_staple', label: 'Commander Staple' },
  { value: 'nft_redeemable', label: 'NFT Redeemable' },
  { value: 'limited_edition', label: 'Limited Edition' },
] as const

export type CardCategory = typeof CARD_CATEGORIES[number]['value']

interface CategorySelectorProps {
  selectedCategories: CardCategory[]
  onChange: (categories: CardCategory[]) => void
  className?: string
  compact?: boolean
}

export function CategorySelector({ selectedCategories, onChange, className, compact = false }: CategorySelectorProps) {
  const [open, setOpen] = useState(false)

  const toggleCategory = (category: CardCategory) => {
    if (selectedCategories.includes(category)) {
      onChange(selectedCategories.filter(c => c !== category))
    } else {
      onChange([...selectedCategories, category])
    }
  }

  const removeCategory = (category: CardCategory) => {
    onChange(selectedCategories.filter(c => c !== category))
  }

  const getTriggerText = () => {
    if (selectedCategories.length === 0) {
      return 'Categories'
    }
    if (selectedCategories.length === 1) {
      const categoryInfo = CARD_CATEGORIES.find(c => c.value === selectedCategories[0])
      return categoryInfo?.label || 'Categories'
    }
    return `${selectedCategories.length} Categories`
  }

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-12 px-3 text-sm justify-between bg-cyber-dark/60 border-cyber-cyan/30 hover:border-cyber-cyan/60 text-white hover:text-white hover:bg-cyber-dark/80 transition-colors",
              className
            )}
          >
            <div className="flex items-center min-w-0">
              <Tags className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
              <span className="truncate">{getTriggerText()}</span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[280px] p-0 bg-cyber-dark border-cyber-cyan/30 z-[150]"
          align="start"
        >
          <Command className="bg-transparent">
            <CommandInput placeholder="Search categories..." className="text-white h-10 [&_svg]:text-gray-400" />
            <CommandEmpty className="text-gray-400 py-6 text-center text-sm">No category found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {CARD_CATEGORIES.map(category => (
                <CommandItem
                  key={category.value}
                  value={category.value}
                  onSelect={() => toggleCategory(category.value)}
                  className="group cursor-pointer text-white hover:bg-cyber-cyan/20 aria-selected:bg-cyber-cyan/10 hover:text-black"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedCategories.includes(category.value)
                        ? "opacity-100 text-cyber-cyan group-hover:text-black"
                        : "opacity-0"
                    )}
                  />
                  {category.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {selectedCategories.length > 0 && (
              <div className="border-t border-cyber-cyan/20 p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange([])}
                  className="w-full h-8 text-xs text-gray-400 hover:text-white hover:bg-cyber-cyan/20"
                >
                  Clear all ({selectedCategories.length})
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className={className}>
      {/* Selected categories display - only show if there are selections */}
      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedCategories.map(category => {
            const categoryInfo = CARD_CATEGORIES.find(c => c.value === category)
            return (
              <Badge
                key={category}
                variant="secondary"
                className="pl-2 pr-1 py-1 bg-cyber-dark/60 border border-cyber-cyan/30 hover:border-cyber-cyan/60 text-white"
              >
                {categoryInfo?.label}
                <button
                  className="ml-1 hover:bg-cyber-cyan/20 rounded-sm"
                  onClick={() => removeCategory(category)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}

      {/* Category selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-cyber-dark/60 border-cyber-cyan/30 hover:border-cyber-cyan hover:bg-cyber-dark/80 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)] text-white hover:text-white transition-all duration-300"
          >
            Select categories...
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-full p-0 bg-cyber-dark border-cyber-cyan/30 z-[150]"
          align="start"
          sideOffset={5}
        >
          <Command className="bg-transparent">
            <CommandInput placeholder="Search categories..." className="text-white [&_svg]:text-gray-400" />
            <CommandEmpty className="text-gray-400 py-6 text-center text-sm">No category found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {CARD_CATEGORIES.map(category => (
                <CommandItem
                  key={category.value}
                  value={category.value}
                  onSelect={() => toggleCategory(category.value)}
                  className="group cursor-pointer text-white hover:bg-cyber-cyan/20 hover:text-black"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedCategories.includes(category.value)
                        ? "opacity-100 text-cyber-cyan group-hover:text-black"
                        : "opacity-0"
                    )}
                  />
                  {category.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
